import { Module } from '@nestjs/common';

import { parseMetaWebhook } from '@dakly/providers/channel/meta/meta-webhook';

import { MessagingModule } from '../messaging/messaging.module';
import { ClockModule } from '../platform/clock.module';
import { ProcessWebhookEventJob } from './jobs/process-webhook-event.job';
import { MetaAuthorizationModule } from './meta-authorization.module';
import { META_WEBHOOK_DRIVER, MetaWebhookRoutingService } from './meta-webhook-routing.service';
import { MetaWebhooksRepository } from './meta-webhooks.repository';

@Module({
  imports: [ClockModule, MetaAuthorizationModule, MessagingModule],
  providers: [
    { provide: META_WEBHOOK_DRIVER, useValue: { parseWebhook: parseMetaWebhook } },
    ProcessWebhookEventJob,
    MetaWebhookRoutingService,
    MetaWebhooksRepository,
  ],
})
export class MetaWebhookRoutingModule {}
