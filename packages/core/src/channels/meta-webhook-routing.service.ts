import { Inject, Injectable } from '@nestjs/common';

import type { ChannelDriver, ChannelKind } from '@dakly/providers/channel/channel-driver';

import { Clock } from '../platform/clock';
import { MetaWebhooksRepository } from './meta-webhooks.repository';

export const META_WEBHOOK_DRIVER = Symbol('META_WEBHOOK_DRIVER');

const connectionKind = {
  messenger: 'facebook_page',
  instagram: 'instagram',
  whatsapp: 'whatsapp',
} satisfies Record<ChannelKind, string>;

@Injectable()
export class MetaWebhookRoutingService {
  constructor(
    @Inject(MetaWebhooksRepository) private readonly repository: MetaWebhooksRepository,
    @Inject(META_WEBHOOK_DRIVER) private readonly driver: Pick<ChannelDriver, 'parseWebhook'>,
    @Inject(Clock) private readonly clock: Clock,
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
    const stores = accounts.size ? await this.repository.findStoresForAccounts(accounts) : [];
    // CHAT-1 will pass messages for the resolved stores to MessagingService.
    const reason = !accounts.size ? 'unsupported_delivery' : 'unknown_account';
    await this.repository.markIgnored(
      webhookEventId,
      stores.some(({ storeId }) => storeId) ? 'messaging_inbound_pending' : reason,
      this.clock.now(),
    );
  }
}
