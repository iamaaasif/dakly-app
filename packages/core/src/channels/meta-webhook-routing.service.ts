import { Inject, Injectable } from '@nestjs/common';

import type { ChannelDriver, ChannelKind } from '@dakly/providers/channel/channel-driver';

import { MessagingService } from '../messaging/messaging.service';
import { Clock } from '../platform/clock';
import { MetaWebhooksRepository } from './meta-webhooks.repository';

export const META_WEBHOOK_DRIVER = Symbol('META_WEBHOOK_DRIVER');

const connectionKind = {
  messenger: 'facebook_page',
  instagram: 'instagram',
  whatsapp: 'whatsapp',
} as const satisfies Record<ChannelKind, string>;

@Injectable()
export class MetaWebhookRoutingService {
  constructor(
    @Inject(MetaWebhooksRepository) private readonly repository: MetaWebhooksRepository,
    @Inject(META_WEBHOOK_DRIVER) private readonly driver: Pick<ChannelDriver, 'parseWebhook'>,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(MessagingService) private readonly messaging: MessagingService,
  ) {}

  async process(webhookEventId: string) {
    const delivery = await this.repository.findReceived(webhookEventId);
    if (!delivery) return;
    const messages = this.driver.parseWebhook(delivery.payload);
    const accounts = new Map(
      messages.map(({ channel, accountExternalId }) => [
        accountExternalId,
        connectionKind[channel],
      ]),
    );
    if (!accounts.size)
      return this.repository.finish(
        webhookEventId,
        'ignored',
        'unsupported_delivery',
        this.clock.now(),
      );
    const stores = new Map(
      (await this.repository.findStoresForAccounts(accounts)).map(
        ({ externalAccountId, storeId }) => [externalAccountId, storeId],
      ),
    );
    let processed = false;
    let reason = 'unknown_account';
    for (const message of messages) {
      const externalAccountId = message.accountExternalId;
      const storeId = stores.get(externalAccountId);
      if (!storeId) continue;
      if (!message.text) {
        reason = 'unsupported_attachment';
        continue;
      }
      const outcome = await this.messaging.receiveInboundMessage(storeId, {
        kind: connectionKind[message.channel],
        externalAccountId,
        externalSenderId: message.senderExternalId,
        externalMessageId: message.externalMessageId,
        content: message.text,
        sentAt: message.sentAt,
        receivedAt: delivery.receivedAt,
      });
      if (outcome === 'stored' || outcome === 'duplicate') processed = true;
      else reason = outcome;
    }
    await this.repository.finish(
      webhookEventId,
      processed ? 'processed' : 'ignored',
      processed ? null : reason,
      this.clock.now(),
    );
  }
}
