import { Module } from '@nestjs/common';

import { parseMetaWebhook } from '@dakly/providers/channel/meta/meta-webhook';

import { ClockModule } from '../platform/clock.module';
import { ProcessWebhookEventJob } from './jobs/process-webhook-event.job';
import { META_WEBHOOK_DRIVER, MetaWebhookRoutingService } from './meta-webhook-routing.service';
import { MetaWebhooksRepository } from './meta-webhooks.repository';

@Module({
  imports: [ClockModule],
  providers: [
    { provide: META_WEBHOOK_DRIVER, useValue: { parseWebhook: parseMetaWebhook } },
    ProcessWebhookEventJob,
    MetaWebhookRoutingService,
    MetaWebhooksRepository,
  ],
})
export class MetaWebhookRoutingModule {}
