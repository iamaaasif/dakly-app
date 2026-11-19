import { Inject, Injectable } from '@nestjs/common';

import type { chatChannels } from '@dakly/contracts/channels';
import { countSmsParts } from '@dakly/contracts/sms';

import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { ConsentService } from '../consents/consent.service';
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

export type InboundMessageInput = {
  connectionId: string;
  externalSenderId: string;
  externalMessageId: string;
  content: string;
  sentAt: Date;
};

type ReceiveOutcome =
  | 'stored'
  | 'duplicate'
  | 'unknown_account'
  | 'deleted_contact'
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

export type SentMessage = { providerMessageId: string; parts: number; credits: number };

@Injectable()
export class MessagingService {
  constructor(
    @Inject(ContactsService) private readonly contactsService: ContactsService,
    @Inject(SmsService) private readonly smsService: SmsService,
    @Inject(SmsSendersService) private readonly smsSenders: SmsSendersService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(InboundMessagingRepository) private readonly inbound: InboundMessagingRepository,
    @Inject(ChannelConnectionsService) private readonly connections: ChannelConnectionsService,
    @Inject(ConsentService) private readonly consent: ConsentService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  receiveInboundMessage(storeId: string, input: InboundMessageInput): Promise<ReceiveOutcome> {
    return this.transaction.runLocked(storeId, async () => {
      const connection = await this.connections.findInbound(storeId, { id: input.connectionId });
      if (!connection) return 'unknown_account';
      const now = this.clock.now();
      const timestamp = input.sentAt.getTime();
      // Meta and Dakly can disagree briefly at the boundary of a new delivery.
      if (!Number.isFinite(timestamp) || timestamp > now.getTime() + MINUTE_MS)
        return 'invalid_timestamp';
      // A former shop's message can carry a provider timestamp ahead of Dakly's clock.
      if (timestamp < connection.connectedAt.getTime() + MINUTE_MS) return 'stale_delivery';
      return this.storeInbound(storeId, input, connection.channel, now);
    });
  }

  private async storeInbound(
    storeId: string,
    input: InboundMessageInput,
    channel: (typeof chatChannels)[number],
    now: Date,
  ): Promise<ReceiveOutcome> {
    const connectionId = input.connectionId;
    const externalIdentity = [connectionId, input.externalMessageId];
    const idempotencyKey = `inbound:${hashToken(JSON.stringify(externalIdentity)).toString('hex')}`;
    if (await this.inbound.hasMessage(storeId, idempotencyKey)) return 'duplicate';

    const contactId = await this.contactsService.findOrCreateByIdentity(storeId, {
      channel,
      connectionId,
      externalId: input.externalSenderId,
    });
    if (!contactId) return 'deleted_contact';
    const { id: conversationId, started } = await this.inbound.getConversation(
      storeId,
      { channel, channelConnectionId: connectionId, contactId },
      now,
    );
    const message = await this.inbound.insertMessage(
      storeId,
      {
        conversationId,
        idempotencyKey,
        externalMessageId: input.externalMessageId,
        text: input.content,
        sentAt: input.sentAt,
      },
      now,
    );
    if (!message) return 'duplicate';
    await this.inbound.advanceConversation(
      storeId,
      {
        conversationId,
        at: input.sentAt,
        expiry: new Date(input.sentAt.getTime() + DAY_MS),
        preview: input.content.slice(0, 160),
      },
      now,
    );
    await this.recordStop(storeId, contactId, channel, input.content);
    const occurredAt = now.toISOString();
    if (started)
      await this.outbox.publish({
        type: 'conversation.started',
        storeId,
        occurredAt,
        payload: { conversationId, contactId, connectionId, channel },
      });
    await this.outbox.publish({
      type: 'message.received',
      storeId,
      occurredAt,
      payload: { messageId: message.id, conversationId, contactId, channel },
    });
    return 'stored';
  }

  // The caller records status and cost in its own short transaction, before and after this.
  async send(
    storeId: string,
    message: OutgoingMessage,
    preparedSender?: PreparedSmsSender,
  ): Promise<SentMessage> {
    if (this.transaction.isOpen()) throw messagingError('MESSAGING_INSIDE_TRANSACTION');
    const { to, parts, sender } = await this.prepareSend(storeId, message, preparedSender);
    const { providerMessageId } = await this.smsService.send({
      to,
      text: message.body,
      idempotencyKey: message.operationKey,
      sender,
    });
    // One SMS credit pays for one part (glossary: message cost).
    return { providerMessageId, parts, credits: parts };
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
  private async prepareSend(
    storeId: string,
    message: OutgoingMessage,
    preparedSender?: PreparedSmsSender,
  ) {
    try {
      const sender =
        preparedSender?.storeId === storeId
          ? preparedSender.name
          : (await this.prepareSender(storeId)).name;
      const phone = await this.contactsService.getPhoneForSend(storeId, message.contactId);
      if (message.destination !== undefined && phone !== message.destination)
        throw messagingError('MESSAGING_DESTINATION_CHANGED');
      if (!phone) throw messagingError('MESSAGING_CONTACT_HAS_NO_PHONE');
      return { to: phone, parts: countSmsParts(message.body), sender };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw messagingError('MESSAGING_PREPARATION_FAILED');
    }
  }
}
