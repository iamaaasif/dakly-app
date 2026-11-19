import { Inject, Injectable } from '@nestjs/common';

import type { ChannelReceipt } from '@dakly/providers/channel/channel-driver';

import { ChannelConnectionsService } from '../channels/channel-connections.service';
import { ContactIdentitiesService } from '../contacts/contact-identities.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { MINUTE_MS } from '../platform/time';
import { ChannelReceiptsRepository } from './channel-receipts.repository';
import { OutboundMessagingRepository } from './outbound-messaging.repository';

type ReceiptOutcome =
  'stored' | 'unknown_account' | 'stale_delivery' | 'unmatched_receipt' | 'receipt_pending';

@Injectable()
export class ChannelReceiptsService {
  constructor(
    @Inject(ChannelConnectionsService) private readonly connections: ChannelConnectionsService,
    @Inject(ContactIdentitiesService) private readonly identities: ContactIdentitiesService,
    @Inject(ChannelReceiptsRepository) private readonly repository: ChannelReceiptsRepository,
    @Inject(OutboundMessagingRepository) private readonly outbound: OutboundMessagingRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  record(
    storeId: string,
    receipt: ChannelReceipt,
    receivedAt: Date,
    finalAttempt: boolean,
  ): Promise<ReceiptOutcome> {
    return this.transaction.runLocked(storeId, async () => {
      const connection = await this.connections.findInbound(storeId, {
        kind: receipt.channel === 'messenger' ? 'facebook_page' : 'instagram',
        externalAccountId: receipt.accountExternalId,
      });
      if (!connection) return 'unknown_account';
      const at = receipt.occurredAt.getTime();
      if (
        receivedAt < connection.connectedAt ||
        at <= connection.connectedAt.getTime() + MINUTE_MS ||
        at > receivedAt.getTime() + MINUTE_MS
      )
        return 'stale_delivery';
      return this.recordForRecipient(storeId, connection.id, receipt, finalAttempt);
    });
  }

  private async recordForRecipient(
    storeId: string,
    connectionId: string,
    receipt: ChannelReceipt,
    finalAttempt: boolean,
  ): Promise<ReceiptOutcome> {
    const identity = await this.identities.findActiveChannelIdentity(storeId, {
      connectionId,
      channel: receipt.channel,
      externalId: receipt.recipientExternalId,
    });
    if (!identity) return 'unmatched_receipt';
    const { id: identityId, contactId } = identity;
    const conversation = await this.outbound.findConversation(storeId, {
      contactId,
      connectionId,
      channel: receipt.channel,
    });
    if (!conversation) return 'unmatched_receipt';
    return this.applyReceipt(
      storeId,
      { conversationId: conversation.id, contactId, identityId },
      receipt,
      finalAttempt,
    );
  }

  private async applyReceipt(
    storeId: string,
    thread: { conversationId: string; contactId: string; identityId: string },
    receipt: ChannelReceipt,
    finalAttempt: boolean,
  ): Promise<ReceiptOutcome> {
    const messages = await this.apply(storeId, thread, receipt);
    if (messages.length) await this.publishReceipts(storeId, thread, receipt, messages);
    const pending =
      receipt.kind !== 'echo' &&
      !finalAttempt &&
      (await this.repository.hasPendingDispatch(storeId, thread, receipt));
    if (!pending && messages.length) return 'stored';
    const matched = await this.repository.countMatches(storeId, thread, receipt);
    if (pending && ('through' in receipt || matched < receipt.externalMessageIds.length))
      return 'receipt_pending';
    return matched ? 'stored' : 'unmatched_receipt';
  }

  private async publishReceipts(
    storeId: string,
    thread: { conversationId: string; contactId: string },
    receipt: ChannelReceipt,
    messages: { id: string }[],
  ) {
    const type = {
      echo: 'message.sent',
      delivered: 'message.delivered',
      read: 'message.read',
    } as const;
    const occurredAt = this.clock.now().toISOString();
    await this.outbox.publishAll(
      messages.map(({ id }) => ({
        type: type[receipt.kind],
        storeId,
        occurredAt,
        payload: {
          messageId: id,
          conversationId: thread.conversationId,
          contactId: thread.contactId,
          channel: receipt.channel,
        },
      })),
    );
  }

  private async apply(
    storeId: string,
    thread: { conversationId: string; identityId: string },
    receipt: ChannelReceipt,
  ) {
    if (receipt.kind !== 'echo') return this.repository.applyReceipt(storeId, thread, receipt);
    const message = await this.repository.acceptEcho(storeId, thread, receipt);
    if (!message) return [];
    await this.outbound.advanceConversation(storeId, thread.conversationId, {
      at: receipt.occurredAt,
      preview: message.body?.slice(0, 160) ?? '',
    });
    return [message];
  }
}
