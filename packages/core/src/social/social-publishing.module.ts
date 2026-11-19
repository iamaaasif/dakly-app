import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Module, type DynamicModule, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { FakeMetaPublishingDriver } from '@dakly/providers/social/meta/fake-meta-publishing-driver';
import { MetaGraphPublishingDriver } from '@dakly/providers/social/meta/meta-graph-publishing-driver';

import { AuditModule } from '../audit/audit.module';
import { MetaAuthorizationModule } from '../channels/meta-authorization.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClockModule } from '../platform/clock.module';
import type { Env } from '../platform/config/env';
import { CryptoModule } from '../platform/crypto/crypto.module';
import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { scheduleJob } from '../platform/queue/job-schedule';
import { QUEUES } from '../platform/queue/queues';
import { MINUTE_MS } from '../platform/time';
import { StoresModule } from '../stores/stores.module';
import { CheckPostTargetJob } from './jobs/check-post-target.job';
import { PublishPostTargetJob } from './jobs/publish-post-target.job';
import { QueuePostOnScheduledJob } from './jobs/queue-post-on-scheduled.job';
import { RECOVER_POST_TARGETS, RecoverPostTargetsJob } from './jobs/recover-post-targets.job';
import { SocialPublishRecoveryRepository } from './social-publish-recovery.repository';
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
    BullModule.registerQueue({ name: QUEUES.outbound }, { name: QUEUES.sync }),
  ],
  providers: [
    SocialRepository,
    SocialPublishRecoveryRepository,
    SocialPublishingService,
    SocialPublishingQueueService,
    CheckPostTargetJob,
    PublishPostTargetJob,
    QueuePostOnScheduledJob,
    RecoverPostTargetsJob,
  ],
})
export class SocialPublishingModule implements OnApplicationBootstrap {
  constructor(@InjectQueue(QUEUES.sync) private readonly sync: Queue) {}

  static forDriver(driver: NonNullable<Env['metaChannel']>['driver']): DynamicModule {
    return {
      module: SocialPublishingModule,
      providers: [
        {
          provide: META_PUBLISHING_DRIVER,
          useValue:
            driver === 'fake' ? new FakeMetaPublishingDriver() : new MetaGraphPublishingDriver(),
        },
      ],
    };
  }

  async onApplicationBootstrap() {
    await scheduleJob(this.sync, RECOVER_POST_TARGETS, MINUTE_MS);
  }
}
