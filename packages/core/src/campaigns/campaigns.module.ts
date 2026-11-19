import { Module } from '@nestjs/common';

import { LinksModule } from '../links/links.module';
import { MessagingModule } from '../messaging/messaging.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CacheModule } from '../platform/cache/cache.module';
import { ClockModule } from '../platform/clock.module';
import { ErrorReportingModule } from '../platform/logging/error-reporting.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { SegmentsModule } from '../segments/segments.module';
import { SendingModule } from '../sending/sending.module';
import { SmsModule } from '../sms/sms.module';
import { StoresModule } from '../stores/stores.module';
import { TeamModule } from '../team/team.module';
import { WalletsModule } from '../wallets/wallets.module';
import { CampaignCountsRepository } from './campaign-counts.repository';
import { CampaignCountsService } from './campaign-counts.service';
import { CampaignFundingService } from './campaign-funding.service';
import { CampaignSenderService } from './campaign-sender.service';
import { CampaignSendingRepository } from './campaign-sending.repository';
import { CampaignSweepService } from './campaign-sweep.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsRepository } from './campaigns.repository';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [
    CacheModule,
    ClockModule,
    LinksModule,
    MessagingModule,
    NotificationsModule,
    ErrorReportingModule,
    OutboxModule,
    SegmentsModule,
    SendingModule,
    SmsModule,
    StoresModule,
    TeamModule,
    WalletsModule,
  ],
  controllers: [CampaignsController],
  providers: [
    CampaignCountsRepository,
    CampaignCountsService,
    CampaignsRepository,
    CampaignSendingRepository,
    CampaignsService,
    CampaignSenderService,
    CampaignSweepService,
    CampaignFundingService,
  ],
  exports: [
    CampaignCountsService,
    CampaignFundingService,
    CampaignSenderService,
    CampaignSweepService,
    CampaignsService,
  ],
})
export class CampaignsModule {}
