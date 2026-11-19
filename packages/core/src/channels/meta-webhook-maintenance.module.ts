import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { QUEUES } from '../platform/queue/queues';
import { PurgeWebhookEventsJob } from './jobs/purge-webhook-events.job';
import { RecoverWebhookEventsJob } from './jobs/recover-webhook-events.job';
import { MetaWebhooksRepository } from './meta-webhooks.repository';
import { MetaWebhooksService } from './meta-webhooks.service';

@Module({
  imports: [ClockModule, BullModule.registerQueue({ name: QUEUES.inbound })],
  providers: [
    MetaWebhooksRepository,
    MetaWebhooksService,
    RecoverWebhookEventsJob,
    PurgeWebhookEventsJob,
  ],
})
export class MetaWebhookMaintenanceModule {}
