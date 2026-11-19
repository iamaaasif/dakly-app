import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { FakeMetaPublishingDriver } from '@dakly/providers/social/meta/fake-meta-publishing-driver';
import { MetaGraphPublishingDriver } from '@dakly/providers/social/meta/meta-graph-publishing-driver';

import { AuditModule } from '../audit/audit.module';
import { MetaAuthorizationModule } from '../channels/meta-authorization.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClockModule } from '../platform/clock.module';
import { loadEnv } from '../platform/config/env';
import { CryptoModule } from '../platform/crypto/crypto.module';
import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { QUEUES } from '../platform/queue/queues';
import { StoresModule } from '../stores/stores.module';
import { CheckPostTargetJob } from './jobs/check-post-target.job';
import { PublishPostTargetJob } from './jobs/publish-post-target.job';
import { QueuePostOnScheduledJob } from './jobs/queue-post-on-scheduled.job';
import { SocialPublishingQueueService } from './social-publishing-queue.service';
import { META_PUBLISHING_DRIVER, SocialPublishingService } from './social-publishing.service';
import { SocialRepository } from './social.repository';

@Module({
  imports: [
    AuditModule,
    ClockModule,
    CryptoModule,
    FileStorageModule,
    MetaAuthorizationModule,
    NotificationsModule,
    OutboxModule,
    StoresModule,
    BullModule.registerQueue({ name: QUEUES.outbound }),
  ],
  providers: [
    SocialRepository,
    SocialPublishingService,
    SocialPublishingQueueService,
    CheckPostTargetJob,
    PublishPostTargetJob,
    QueuePostOnScheduledJob,
    {
      provide: META_PUBLISHING_DRIVER,
      useFactory: () => {
        const driver = loadEnv().metaChannel?.driver;
        if (driver === 'graph') return new MetaGraphPublishingDriver();
        return driver === 'fake' ? new FakeMetaPublishingDriver() : null;
      },
    },
  ],
})
export class SocialPublishingModule {}
