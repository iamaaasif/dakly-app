import { Module } from '@nestjs/common';

import {
  parseMetaComments,
  parseMetaPostbacks,
  parseMetaReceipts,
  parseMetaWebhook,
} from '@dakly/providers/channel/meta/meta-webhook';

import { CommentsModule } from '../comments/comments.module';
import { MessagingModule } from '../messaging/messaging.module';
import { ClockModule } from '../platform/clock.module';
import { ProcessWebhookEventJob } from './jobs/process-webhook-event.job';
import { META_WEBHOOK_DRIVER, MetaWebhookRoutingService } from './meta-webhook-routing.service';
import { MetaWebhooksRepository } from './meta-webhooks.repository';

@Module({
  imports: [ClockModule, CommentsModule, MessagingModule],
  providers: [
    {
      provide: META_WEBHOOK_DRIVER,
      useValue: {
        parseWebhook: parseMetaWebhook,
        parseReceipts: parseMetaReceipts,
        parsePostbacks: parseMetaPostbacks,
        parseComments: parseMetaComments,
      },
    },
    ProcessWebhookEventJob,
    MetaWebhookRoutingService,
    MetaWebhooksRepository,
  ],
})
export class MetaWebhookRoutingModule {}
