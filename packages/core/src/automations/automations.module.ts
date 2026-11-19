import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { ClockModule } from '../platform/clock.module';
import { SegmentsModule } from '../segments/segments.module';
import { StoresModule } from '../stores/stores.module';
import { TeamModule } from '../team/team.module';
import { WalletsModule } from '../wallets/wallets.module';
import { AutomationPreviewRepository } from './automation-preview.repository';
import { AutomationPreviewService } from './automation-preview.service';
import { AutomationsController } from './automations.controller';
import { AutomationsRepository } from './automations.repository';
import { AutomationsService } from './automations.service';

@Module({
  imports: [
    ClockModule,
    NotificationsModule,
    SegmentsModule,
    StoresModule,
    TeamModule,
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
