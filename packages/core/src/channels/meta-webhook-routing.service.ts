import { Inject, Injectable } from '@nestjs/common';

import type {
  ChannelDriver,
  ChannelKind,
  InboundMessage,
} from '@dakly/providers/channel/channel-driver';

import { ChannelReceiptsService } from '../messaging/channel-receipts.service';
import { MessagingService } from '../messaging/messaging.service';
import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { MetaWebhooksRepository } from './meta-webhooks.repository';

export const META_WEBHOOK_DRIVER = Symbol('META_WEBHOOK_DRIVER');

const connectionKind = {
  messenger: 'facebook_page',
  instagram: 'instagram',
  whatsapp: 'whatsapp',
} as const satisfies Record<ChannelKind, string>;

function accountKey(kind: string, externalAccountId: string) {
  return `${kind}:${externalAccountId}`;
}

@Injectable()
export class MetaWebhookRoutingService {
  private readonly appId = loadEnv().META_APP_ID;

  constructor(
    @Inject(MetaWebhooksRepository) private readonly repository: MetaWebhooksRepository,
    @Inject(META_WEBHOOK_DRIVER)
    private readonly driver: Pick<ChannelDriver, 'parseWebhook' | 'parseReceipts'>,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(ChannelReceiptsService) private readonly receipts: ChannelReceiptsService,
  ) {}

  async process(webhookEventId: string, finalAttempt: boolean) {
    const delivery = await this.repository.findReceived(webhookEventId);
    if (!delivery) return;
    const messages = this.driver.parseWebhook(delivery.payload);
    const receipts = this.driver.parseReceipts(delivery.payload);
    const events = [
      ...messages,
      ...receipts.filter(
        (receipt) => receipt.kind === 'echo' && receipt.appExternalId === this.appId,
      ),
      ...receipts.filter((receipt) => receipt.kind !== 'echo'),
    ];
    const accounts = new Map(
      events.map(({ channel, accountExternalId }) => {
        const kind = connectionKind[channel];
        return [
          accountKey(kind, accountExternalId),
          { kind, externalAccountId: accountExternalId },
        ];
      }),
    );
    if (!accounts.size)
      return this.repository.finish(
        webhookEventId,
        'ignored',
        'unsupported_delivery',
        this.clock.now(),
      );
    const stores = new Map(
      (await this.repository.findStoresForAccounts([...accounts.values()])).map(
        ({ kind, externalAccountId, storeId }) => [accountKey(kind, externalAccountId), storeId],
      ),
    );
    let processed = false;
    let reason = 'unknown_account';
    for (const event of events) {
      const storeId = stores.get(
        accountKey(connectionKind[event.channel], event.accountExternalId),
      );
      if (!storeId) continue;
      const outcome =
        'kind' in event
          ? await this.receipts.record(storeId, event, delivery.receivedAt, finalAttempt)
          : await this.routeMessage(storeId, event, delivery.receivedAt);
      if (outcome === 'receipt_pending') throw new Error('Meta receipt is awaiting a send result');
      if (['stored', 'duplicate'].includes(outcome)) processed = true;
      else reason = outcome;
    }
    await this.repository.finish(
      webhookEventId,
      processed ? 'processed' : 'ignored',
      processed ? null : reason,
      this.clock.now(),
    );
  }

  private routeMessage(storeId: string, message: InboundMessage, receivedAt: Date) {
    if (!message.text) return 'unsupported_attachment';
    return this.messaging.receiveInboundMessage(storeId, {
      kind: connectionKind[message.channel],
      externalAccountId: message.accountExternalId,
      externalSenderId: message.senderExternalId,
      externalMessageId: message.externalMessageId,
      content: message.text,
      sentAt: message.sentAt,
      receivedAt,
    });
  }
}
