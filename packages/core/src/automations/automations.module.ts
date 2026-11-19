import { Module } from '@nestjs/common';

import { UsersModule } from '../auth/users.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CacheModule } from '../platform/cache/cache.module';
import { ClockModule } from '../platform/clock.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { SegmentsModule } from '../segments/segments.module';
import { StoresModule } from '../stores/stores.module';
import { TeamModule } from '../team/team.module';
import { AutomationPreviewRepository } from './automation-preview.repository';
import { AutomationPreviewService } from './automation-preview.service';
import { WalletsModule } from '../wallets/wallets.module';
import { AutomationsController } from './automations.controller';
import { AutomationsRepository } from './automations.repository';
import { AutomationsService } from './automations.service';

@Module({
  imports: [
    CacheModule,
    ClockModule,
    EmailModule,
    NotificationsModule,
    OutboxModule,
    SegmentsModule,
    StoresModule,
    TeamModule,
    UsersModule,
    WalletsModule,
  ],
  controllers: [AutomationsController],
  providers: [
    AutomationsRepository,
    AutomationsService,
    AutomationPreviewRepository,
    AutomationPreviewService,
  ],
  exports: [AutomationsService],
})
export class AutomationsModule {}
