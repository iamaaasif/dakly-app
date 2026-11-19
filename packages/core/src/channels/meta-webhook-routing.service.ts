import { Inject, Injectable } from '@nestjs/common';

import type {
  ChannelDriver,
  ChannelKind,
  InboundMessage,
} from '@dakly/providers/channel/channel-driver';

import { MessagingService } from '../messaging/messaging.service';
import { Clock } from '../platform/clock';
import { MINUTE_MS } from '../platform/time';
import { ChannelConnectionsService } from './channel-connections.service';
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
    @Inject(ChannelConnectionsService) private readonly connections: ChannelConnectionsService,
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
      const outcome = await this.receive(storeId, message, delivery.receivedAt);
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

  private async receive(storeId: string, message: InboundMessage, receivedAt: Date) {
    if (!message.text) return 'unsupported_attachment';
    const connection = await this.connections.findInbound(storeId, {
      kind: connectionKind[message.channel],
      externalAccountId: message.accountExternalId,
    });
    if (!connection) return 'unknown_account';
    if (receivedAt < connection.connectedAt) return 'stale_delivery';
    if (message.sentAt.getTime() > receivedAt.getTime() + MINUTE_MS) return 'invalid_timestamp';
    return this.messaging.receiveInboundMessage(storeId, {
      connectionId: connection.id,
      externalSenderId: message.senderExternalId,
      externalMessageId: message.externalMessageId,
      content: message.text,
      sentAt: message.sentAt,
    });
  }
}
