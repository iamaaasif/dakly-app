import { Inject, Injectable } from '@nestjs/common';

import type {
  ChannelDriver,
  ChannelKind,
  ChannelReceipt,
  InboundMessage,
  InboundPostback,
} from '@dakly/providers/channel/channel-driver';

import { ChannelReceiptsService } from '../messaging/channel-receipts.service';
import { MessagingService } from '../messaging/messaging.service';
import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { AppError } from '../platform/errors/app-error';
import { META_WEBHOOK_ERRORS } from './meta-webhooks.errors';
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
    private readonly driver: Pick<
      ChannelDriver,
      'parseWebhook' | 'parseReceipts' | 'parsePostbacks'
    >,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(ChannelReceiptsService) private readonly receipts: ChannelReceiptsService,
  ) {}

  async process(webhookEventId: string, finalAttempt: boolean) {
    try {
      await this.routeDelivery(webhookEventId, finalAttempt);
    } catch (error) {
      if (finalAttempt)
        await this.repository.finish(webhookEventId, {
          status: 'failed',
          error: 'processing_failed',
          processedAt: this.clock.now(),
        });
      throw error;
    }
  }

  private async routeDelivery(webhookEventId: string, finalAttempt: boolean) {
    const delivery = await this.repository.findReceived(webhookEventId);
    if (!delivery) return;
    const messages = this.driver.parseWebhook(delivery.payload);
    const receipts = this.driver.parseReceipts(delivery.payload);
    const events = [
      ...messages,
      ...this.driver.parsePostbacks(delivery.payload),
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
      return this.repository.finish(webhookEventId, {
        status: 'ignored',
        error: 'unsupported_delivery',
        processedAt: this.clock.now(),
        payload: null,
      });
    const stores = new Map(
      (await this.repository.findStoresForAccounts([...accounts.values()])).map(
        ({ kind, externalAccountId, storeId }) => [accountKey(kind, externalAccountId), storeId],
      ),
    );
    const outcomes = [];
    for (const event of events) {
      const storeId = stores.get(
        accountKey(connectionKind[event.channel], event.accountExternalId),
      );
      if (!storeId) continue;
      outcomes.push(await this.routeEvent(storeId, event, delivery.receivedAt, finalAttempt));
    }
    if (outcomes.includes('receipt_pending'))
      throw new AppError('META_RECEIPT_PENDING', META_WEBHOOK_ERRORS.META_RECEIPT_PENDING);
    const processed = outcomes.some((outcome) => ['stored', 'duplicate'].includes(outcome));
    const reason = outcomes.at(-1) ?? 'unknown_account';
    await this.repository.finish(webhookEventId, {
      status: processed ? 'processed' : 'ignored',
      error: processed ? null : reason,
      processedAt: this.clock.now(),
      payload: null,
    });
  }

  private routeEvent(
    storeId: string,
    event: InboundMessage | InboundPostback | ChannelReceipt,
    receivedAt: Date,
    finalAttempt: boolean,
  ) {
    if ('kind' in event) return this.receipts.record(storeId, event, receivedAt, finalAttempt);
    if ('payload' in event) return this.routePostback(storeId, event, receivedAt);
    return this.routeMessage(storeId, event, receivedAt);
  }

  private routePostback(storeId: string, postback: InboundPostback, receivedAt: Date) {
    return this.messaging.receivePostback(storeId, {
      kind: connectionKind[postback.channel],
      externalAccountId: postback.accountExternalId,
      externalSenderId: postback.senderExternalId,
      payload: postback.payload,
      sentAt: postback.occurredAt,
      receivedAt,
    });
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
