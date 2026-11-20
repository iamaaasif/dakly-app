import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { MetaAuthorizationModule } from '../channels/meta-authorization.module';
import { ClockModule } from '../platform/clock.module';
import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { StoresModule } from '../stores/stores.module';
import { TeamModule } from '../team/team.module';
import { PostMediaController } from './post-media.controller';
import { PostMediaService } from './post-media.service';
import { PostingSlotsController } from './posting-slots.controller';
import { PostingSlotsService } from './posting-slots.service';
import { SocialAnalyticsRepository } from './social-analytics.repository';
import { SocialAnalyticsService } from './social-analytics.service';
import { SocialRescheduleRepository } from './social-reschedule.repository';
import { SocialRescheduleService } from './social-reschedule.service';
import { SocialController } from './social.controller';
import { SocialRepository } from './social.repository';
import { SocialService } from './social.service';

@Module({
  imports: [
    AuditModule,
    ClockModule,
    FileStorageModule,
    MetaAuthorizationModule,
    OutboxModule,
    StoresModule,
    TeamModule,
  ],
  controllers: [PostingSlotsController, PostMediaController, SocialController],
  providers: [
    PostingSlotsService,
    PostMediaService,
    SocialAnalyticsRepository,
    SocialAnalyticsService,
    SocialRescheduleService,
    SocialService,
    SocialRescheduleRepository,
    SocialRepository,
  ],
  exports: [SocialAnalyticsService],
})
export class SocialModule {}
