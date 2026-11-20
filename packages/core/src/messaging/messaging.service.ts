import { Inject, Injectable } from '@nestjs/common';

import type { channelConnectionKinds, chatChannels } from '@dakly/contracts/channels';
import type { messageAttachmentKinds } from '@dakly/contracts/chats';
import { countSmsParts } from '@dakly/contracts/sms';

import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { ConsentService } from '../consents/consent.service';
import { ContactIdentitiesService } from '../contacts/contact-identities.service';
import { ContactsService } from '../contacts/contacts.service';
import { Clock } from '../platform/clock';
import { hashToken } from '../platform/crypto/token-hash';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { OutboxService } from '../platform/outbox/outbox.service';
import { DAY_MS, MINUTE_MS } from '../platform/time';
import { SmsService } from '../sms/sms.service';
import { SmsSendersService } from '../sms-senders/sms-senders.service';
import { ChannelDispatchService, type CampaignMessageContent } from './channel-dispatch.service';
import { InboundMessagingRepository } from './inbound-messaging.repository';
import { messagingError } from './messaging.errors';
import { OutboundMessagingRepository } from './outbound-messaging.repository';
import type { OutgoingChannelMessage } from './outgoing-channel-message';

export type InboundMessageInput = {
  kind: (typeof channelConnectionKinds)[number];
  externalAccountId: string;
  externalSenderId: string;
  externalMessageId: string;
  // Null when the customer sent only attachments.
  content: string | null;
  attachments: { kind: (typeof messageAttachmentKinds)[number]; sourceUrl: string }[];
  sentAt: Date;
  receivedAt: Date;
};

export type PostbackInput = Omit<
  InboundMessageInput,
  'externalMessageId' | 'content' | 'attachments' | 'kind'
> & {
  kind: 'facebook_page' | 'instagram';
  payload: string;
};

const attachmentPreviews = {
  image: 'Photo',
  voice: 'Voice message',
  video: 'Video',
  file: 'File',
} as const;

type ReceiveOutcome =
  | 'stored'
  | 'duplicate'
  | 'unknown_account'
  | 'unknown_contact'
  | 'stale_delivery'
  | 'invalid_timestamp';

export type OutgoingMessage = {
  channel: 'sms';
  contactId: string;
  body: string;
  operationKey: string;
  destination?: string | null;
};

export type PreparedSmsSender = { storeId: string; name: string | undefined };
export type PreparedSms = {
  storeId: string;
  contactId: string;
  to: string | null;
  sender: string | undefined;
};

export type SentMessage = { providerMessageId: string; parts: number; credits: number };

@Injectable()
export class MessagingService {
  constructor(
    @Inject(ContactsService) private readonly contactsService: ContactsService,
    @Inject(ContactIdentitiesService) private readonly identities: ContactIdentitiesService,
    @Inject(SmsService) private readonly smsService: SmsService,
    @Inject(SmsSendersService) private readonly smsSenders: SmsSendersService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(InboundMessagingRepository) private readonly inbound: InboundMessagingRepository,
    @Inject(ChannelConnectionsService) private readonly connections: ChannelConnectionsService,
    @Inject(ConsentService) private readonly consent: ConsentService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(OutboundMessagingRepository) private readonly outbound: OutboundMessagingRepository,
    @Inject(ChannelDispatchService) private readonly dispatch: ChannelDispatchService,
  ) {}

  receiveInboundMessage(storeId: string, input: InboundMessageInput): Promise<ReceiveOutcome> {
    return this.transaction.run(storeId, async () => {
      const connection = await this.connections.findInbound(storeId, input);
      if (!connection) return 'unknown_account';
      // A former shop's message can carry a provider timestamp ahead of Dakly's clock.
      if (
        input.receivedAt < connection.connectedAt ||
        input.sentAt.getTime() <= connection.connectedAt.getTime() + MINUTE_MS
      )
        return 'stale_delivery';
      if (input.sentAt.getTime() > input.receivedAt.getTime() + MINUTE_MS)
        return 'invalid_timestamp';
      const externalIdentity = [connection.id, input.externalMessageId];
      const idempotencyKey = `inbound:${hashToken(JSON.stringify(externalIdentity)).toString('hex')}`;
      if (!(await this.inbound.claimMessageKey(storeId, idempotencyKey))) return 'duplicate';
      return this.storeInbound(storeId, input, { ...connection, idempotencyKey });
    });
  }

  // A tap is not a message: it is not stored and does not reopen the chat, but Meta counts it as
  // the customer acting, so it moves the 24-hour window. Meta can redeliver it, so a consumer
  // must tolerate a repeated event.
  receivePostback(storeId: string, input: PostbackInput): Promise<ReceiveOutcome> {
    return this.transaction.run(storeId, async () => {
      const connection = await this.connections.findInbound(storeId, input);
      if (!connection) return 'unknown_account';
      if (
        input.receivedAt < connection.connectedAt ||
        input.sentAt.getTime() <= connection.connectedAt.getTime() + MINUTE_MS
      )
        return 'stale_delivery';
      const channel = input.kind === 'facebook_page' ? 'messenger' : 'instagram';
      // A button reaches only people the shop already wrote to, so the contact and chat exist.
      const identity = await this.identities.findActiveChannelIdentity(storeId, {
        channel,
        connectionId: connection.id,
        externalId: input.externalSenderId,
      });
      const conversation =
        identity &&
        (await this.outbound.findConversation(storeId, {
          channel,
          connectionId: connection.id,
          contactId: identity.contactId,
        }));
      if (!identity || !conversation) return 'unknown_contact';
      await this.inbound.recordTap(
        storeId,
        {
          conversationId: conversation.id,
          at: input.sentAt,
          expiry: new Date(input.sentAt.getTime() + DAY_MS),
        },
        this.clock.now(),
      );
      await this.outbox.publish({
        type: 'message.postback_received',
        storeId,
        occurredAt: this.clock.now().toISOString(),
        payload: {
          conversationId: conversation.id,
          contactId: identity.contactId,
          channel,
          postback: input.payload,
        },
      });
      return 'stored';
    });
  }

  private async storeInbound(
    storeId: string,
    input: InboundMessageInput,
    delivery: { id: string; channel: (typeof chatChannels)[number]; idempotencyKey: string },
  ): Promise<ReceiveOutcome> {
    const { id: connectionId, channel, idempotencyKey } = delivery;
    const { id: senderIdentityId, contactId } = await this.contactsService.findOrCreateByIdentity(
      storeId,
      { channel, connectionId, externalId: input.externalSenderId },
    );
    // Sample receipt time after the contact lock so a waiting webhook cannot backdate the burst.
    const now = this.clock.now();
    const conversation = await this.inbound.getConversation(
      storeId,
      { channel, channelConnectionId: connectionId, contactId },
      now,
    );
    const message = await this.inbound.insertMessage(
      storeId,
      {
        conversationId: conversation.id,
        idempotencyKey,
        senderIdentityId,
        externalMessageId: input.externalMessageId,
        text: input.content,
        attachments: input.attachments,
        sentAt: input.sentAt,
      },
      now,
    );
    if (!message) return 'duplicate';
    const reopen =
      (conversation.status === 'done' || conversation.status === 'later') &&
      (!conversation.lastInboundAt || input.sentAt > conversation.lastInboundAt);
    await this.inbound.advanceConversation(
      storeId,
      {
        conversationId: conversation.id,
        at: input.sentAt,
        expiry: new Date(input.sentAt.getTime() + DAY_MS),
        preview: input.content
          ? input.content.slice(0, 160)
          : attachmentPreviews[input.attachments[0]!.kind],
        reopenVersion: reopen ? conversation.version : undefined,
      },
      now,
    );
    if (input.content) await this.recordStop(storeId, contactId, channel, input.content);
    await this.publishInbound(
      storeId,
      input,
      { message, conversation, contactId, connectionId, channel },
      now,
    );
    return 'stored';
  }

  private async publishInbound(
    storeId: string,
    input: InboundMessageInput,
    saved: {
      message: { id: string };
      conversation: { id: string; started: boolean };
      contactId: string;
      connectionId: string;
      channel: (typeof chatChannels)[number];
    },
    now: Date,
  ) {
    const { message, conversation, contactId, connectionId, channel } = saved;
    const occurredAt = now.toISOString();
    if (conversation.started)
      await this.outbox.publish({
        type: 'conversation.started',
        storeId,
        occurredAt,
        payload: { conversationId: conversation.id, contactId, connectionId, channel },
      });
    if (input.attachments.length)
      await this.outbox.publish({
        type: 'message.attachments_requested',
        storeId,
        occurredAt,
        payload: { messageId: message.id },
      });
    await this.outbox.publish({
      type: 'message.received',
      storeId,
      occurredAt,
      payload: { messageId: message.id, conversationId: conversation.id, contactId, channel },
    });
  }

  // The caller records status and cost in its own short transaction, before and after this.
  async send(
    storeId: string,
    message: OutgoingMessage,
    prepared?: PreparedSmsSender | PreparedSms,
  ): Promise<SentMessage> {
    if (this.transaction.isOpen()) throw messagingError('MESSAGING_INSIDE_TRANSACTION');
    const sms =
      prepared && 'contactId' in prepared
        ? prepared
        : await this.prepareSms(storeId, message.contactId, prepared);
    if (sms.storeId !== storeId || sms.contactId !== message.contactId)
      throw messagingError('MESSAGING_PREPARATION_FAILED');
    const { to, sender } = sms;
    if (message.destination !== undefined && to !== message.destination)
      throw messagingError('MESSAGING_DESTINATION_CHANGED');
    if (!to) throw messagingError('MESSAGING_CONTACT_HAS_NO_PHONE');
    const parts = countSmsParts(message.body);
    const { providerMessageId } = await this.smsService.send({
      to,
      text: message.body,
      idempotencyKey: message.operationKey,
      sender,
    });
    // One SMS credit pays for one part (glossary: message cost).
    return { providerMessageId, parts, credits: parts };
  }

  // Who a Messenger campaign can reach on one Page: a contact's id on that Page is Page-scoped, so
  // the identity and the last message come from the selected connection only.
  async pageAudience(storeId: string, connectionId: string, contactIds: string[]) {
    const [identities, conversations] = await Promise.all([
      this.identities.findOnConnection(storeId, connectionId, contactIds),
      this.inbound.findLastInbound(storeId, connectionId, contactIds),
    ]);
    const lastInboundAt = new Map(conversations.map((row) => [row.contactId, row.lastInboundAt]));
    return new Map(
      identities.map(({ id, contactId, externalId }) => [
        contactId,
        {
          identityId: id,
          address: externalId,
          lastInboundAt: lastInboundAt.get(contactId) ?? null,
        },
      ]),
    );
  }

  // A workflow is not tied to a Page: it answers where the contact wrote last.
  async latestMessengerRoute(storeId: string, contactId: string) {
    const latest = await this.inbound.findLatestInbound(storeId, contactId);
    if (!latest?.connectionId || !latest.lastInboundAt) return undefined;
    const [identity] = await this.identities.findOnConnection(storeId, latest.connectionId, [
      contactId,
    ]);
    if (!identity) return undefined;
    return {
      connectionId: latest.connectionId,
      identityId: identity.id,
      address: identity.externalId,
      lastInboundAt: latest.lastInboundAt,
    };
  }

  queueChannelMessage(storeId: string, input: OutgoingChannelMessage) {
    return this.queueMessage(storeId, input, true);
  }

  // A campaign recipient's or workflow step's Messenger message is stored in the chat and sent by
  // the same transport. The campaign has already run its own checks and sends right away, so no
  // send job is requested. Call it outside a store transaction.
  async sendCampaignMessage(
    storeId: string,
    input: Omit<OutgoingChannelMessage, 'category' | 'actor'> & {
      category?: OutgoingChannelMessage['category'];
      imageUrl?: string;
      buttons?: { title: string; payload: string }[];
    },
  ) {
    const { imageUrl, buttons, category = 'marketing', ...message } = input;
    const { messageId } = await this.queueMessage(
      storeId,
      { ...message, category, actor: { kind: 'system' } },
      false,
    );
    const content: CampaignMessageContent = { imageUrl, buttons };
    return this.dispatch.sendCampaignMessage(storeId, messageId, content);
  }

  private queueMessage(storeId: string, input: OutgoingChannelMessage, requestSend: boolean) {
    return this.transaction.run(storeId, async () => {
      const conversation = await this.outbound.findConversation(storeId, input);
      if (!conversation || !(await this.identities.findOutboundIdentity(storeId, input)))
        throw messagingError('CONVERSATION_NOT_FOUND');
      const idempotencyKey = `outbound:${hashToken(input.operationKey).toString('hex')}`;
      const now = this.clock.now();
      const { message, created } = await this.outbound.queue(
        storeId,
        { ...input, conversationId: conversation.id, idempotencyKey },
        now,
      );
      if (!message) throw messagingError('MESSAGE_OPERATION_CONFLICT');
      if (created && requestSend)
        await this.outbox.publish({
          type: 'message.send_requested',
          storeId,
          occurredAt: now.toISOString(),
          payload: { messageId: message.id },
        });
      return { messageId: message.id };
    });
  }

  async prepareSender(storeId: string): Promise<PreparedSmsSender> {
    try {
      return { storeId, name: await this.smsSenders.approvedSenderName(storeId) };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw messagingError('MESSAGING_PREPARATION_FAILED');
    }
  }

  private async recordStop(
    storeId: string,
    contactId: string,
    channel: (typeof chatChannels)[number],
    text: string,
  ) {
    if (channel !== 'messenger' && channel !== 'whatsapp') return;
    const keyword = text.trim().toLowerCase();
    if (keyword !== 'stop' && keyword !== 'বন্ধ') return;
    await this.consent.record(
      storeId,
      {
        contactId,
        channel,
        status: 'withdrawn',
        source: 'stop_keyword',
        evidence: keyword,
      },
      { kind: 'system' },
    );
  }

  // A failed lookup proves only that this attempt did not reach the provider.
  async prepareSms(
    storeId: string,
    contactId: string,
    preparedSender?: PreparedSmsSender,
  ): Promise<PreparedSms> {
    try {
      const sender =
        preparedSender?.storeId === storeId
          ? preparedSender.name
          : (await this.prepareSender(storeId)).name;
      const to = await this.contactsService.getPhoneForSend(storeId, contactId);
      return { storeId, contactId, to, sender };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw messagingError('MESSAGING_PREPARATION_FAILED');
    }
  }
}
