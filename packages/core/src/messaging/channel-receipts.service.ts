import { Inject, Injectable } from '@nestjs/common';

import type { ChannelReceipt } from '@dakly/providers/channel/channel-driver';

import { ChannelConnectionsService } from '../channels/channel-connections.service';
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
    return this.transaction.run(storeId, async () => {
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
      const thread = await this.repository.findThread(storeId, {
        ...receipt,
        connectionId: connection.id,
      });
      if (!thread) return 'unmatched_receipt';
      if (
        !finalAttempt &&
        receipt.kind !== 'echo' &&
        (await this.repository.hasPendingDispatch(storeId, thread, receipt))
      )
        return 'receipt_pending';
      return this.applyAndPublish(storeId, thread, receipt);
    });
  }

  private async applyAndPublish(
    storeId: string,
    thread: { conversationId: string; contactId: string; identityId: string },
    receipt: ChannelReceipt,
  ): Promise<ReceiptOutcome> {
    const messages = await this.apply(storeId, thread, receipt);
    if (!messages.length) return 'unmatched_receipt';
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
    return 'stored';
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
