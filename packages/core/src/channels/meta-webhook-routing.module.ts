import { Module } from '@nestjs/common';

import { parseMetaReceipts, parseMetaWebhook } from '@dakly/providers/channel/meta/meta-webhook';

import { MessagingModule } from '../messaging/messaging.module';
import { ClockModule } from '../platform/clock.module';
import { ProcessWebhookEventJob } from './jobs/process-webhook-event.job';
import { META_WEBHOOK_DRIVER, MetaWebhookRoutingService } from './meta-webhook-routing.service';
import { MetaWebhooksRepository } from './meta-webhooks.repository';

@Module({
  imports: [ClockModule, MessagingModule],
  providers: [
    {
      provide: META_WEBHOOK_DRIVER,
      useValue: { parseWebhook: parseMetaWebhook, parseReceipts: parseMetaReceipts },
    },
    ProcessWebhookEventJob,
    MetaWebhookRoutingService,
    MetaWebhooksRepository,
  ],
})
export class MetaWebhookRoutingModule {}
