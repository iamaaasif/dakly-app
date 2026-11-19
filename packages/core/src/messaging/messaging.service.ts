import { Inject, Injectable } from '@nestjs/common';

import type { channelConnectionKinds, chatChannels } from '@dakly/contracts/channels';
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
import { InboundMessagingRepository } from './inbound-messaging.repository';
import { messagingError } from './messaging.errors';
import { OutboundMessagingRepository } from './outbound-messaging.repository';
import type { OutgoingChannelMessage } from './outgoing-channel-message';

export type InboundMessageInput = {
  kind: (typeof channelConnectionKinds)[number];
  externalAccountId: string;
  externalSenderId: string;
  externalMessageId: string;
  content: string;
  sentAt: Date;
  receivedAt: Date;
};

type ReceiveOutcome =
  'stored' | 'duplicate' | 'unknown_account' | 'stale_delivery' | 'invalid_timestamp';

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
        preview: input.content.slice(0, 160),
        reopenVersion: reopen ? conversation.version : undefined,
      },
      now,
    );
    await this.recordStop(storeId, contactId, channel, input.content);
    const occurredAt = now.toISOString();
    if (conversation.started)
      await this.outbox.publish({
        type: 'conversation.started',
        storeId,
        occurredAt,
        payload: { conversationId: conversation.id, contactId, connectionId, channel },
      });
    await this.outbox.publish({
      type: 'message.received',
      storeId,
      occurredAt,
      payload: { messageId: message.id, conversationId: conversation.id, contactId, channel },
    });
    return 'stored';
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

  queueChannelMessage(storeId: string, input: OutgoingChannelMessage) {
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
      if (created)
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
