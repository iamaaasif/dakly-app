import { BullModule } from '@nestjs/bullmq';
import { Module, type DynamicModule } from '@nestjs/common';

import { AnalyticsReportsModule } from '../analytics/analytics-reports.module';
import { UsersModule } from '../auth/users.module';
import { BillingModule } from '../billing/billing.module';
import { MetaAuthorizationModule } from '../channels/meta-authorization.module';
import { LinksModule } from '../links/links.module';
import { MessagingModule } from '../messaging/messaging.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CacheModule } from '../platform/cache/cache.module';
import { ClockModule } from '../platform/clock.module';
import { ErrorReportingModule } from '../platform/logging/error-reporting.module';
import { OutboxModule } from '../platform/outbox/outbox.module';
import { QUEUES } from '../platform/queue/queues';
import { SegmentsModule } from '../segments/segments.module';
import { SendingModule } from '../sending/sending.module';
import { SmsModule } from '../sms/sms.module';
import { SmsSendersModule } from '../sms-senders/sms-senders.module';
import { StoresModule } from '../stores/stores.module';
import { TeamModule } from '../team/team.module';
import { WalletsModule } from '../wallets/wallets.module';
import { CampaignAnalyticsRepository } from './campaign-analytics.repository';
import { CampaignApprovalQueueService } from './campaign-approval-queue.service';
import { CampaignApprovalRepository } from './campaign-approval.repository';
import { CampaignApprovalService } from './campaign-approval.service';
import { CampaignAudienceService } from './campaign-audience.service';
import { CampaignBatchService } from './campaign-batch.service';
import { CampaignCountsRepository } from './campaign-counts.repository';
import { CampaignCountsService } from './campaign-counts.service';
import { CampaignDuplicateService } from './campaign-duplicate.service';
import { CampaignFundingService } from './campaign-funding.service';
import { CampaignMessageTotalsRepository } from './campaign-message-totals.repository';
import { CampaignMessengerSender } from './campaign-messenger-sender.service';
import { CampaignReceiptReconciler } from './campaign-receipt-reconciler.service';
import { CampaignResultsRepository } from './campaign-results.repository';
import { CampaignResultsService } from './campaign-results.service';
import { CampaignSenderService } from './campaign-sender.service';
import { CampaignSendingRepository } from './campaign-sending.repository';
import { CampaignSmsService } from './campaign-sms.service';
import { CampaignSourceAudienceRepository } from './campaign-source-audience.repository';
import { CampaignSourceService } from './campaign-source.service';
import { CampaignSweepService } from './campaign-sweep.service';
import { CampaignTestSendService } from './campaign-test-send.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsRepository } from './campaigns.repository';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [
    BillingModule,
    AnalyticsReportsModule,
    CacheModule,
    ClockModule,
    LinksModule,
    MessagingModule,
    MetaAuthorizationModule,
    NotificationsModule,
    ErrorReportingModule,
    OutboxModule,
    SegmentsModule,
    SendingModule,
    SmsModule,
    SmsSendersModule,
    StoresModule,
    TeamModule,
    UsersModule,
    WalletsModule,
  ],
  controllers: [CampaignsController],
  providers: [
    CampaignAnalyticsRepository,
    CampaignApprovalRepository,
    CampaignApprovalService,
    CampaignAudienceService,
    CampaignCountsRepository,
    CampaignCountsService,
    CampaignDuplicateService,
    CampaignMessageTotalsRepository,
    CampaignResultsRepository,
    CampaignResultsService,
    CampaignsRepository,
    CampaignSendingRepository,
    CampaignSourceAudienceRepository,
    CampaignSourceService,
    CampaignSmsService,
    CampaignTestSendService,
    CampaignsService,
    CampaignMessengerSender,
    CampaignReceiptReconciler,
    CampaignSenderService,
    CampaignFundingService,
  ],
  exports: [
    CampaignApprovalService,
    CampaignCountsService,
    CampaignFundingService,
    CampaignsService,
  ],
})
export class CampaignsModule {
  static forWorker(): DynamicModule {
    return {
      module: CampaignsModule,
      imports: [BullModule.registerQueue({ name: QUEUES.campaign })],
      providers: [CampaignApprovalQueueService, CampaignBatchService, CampaignSweepService],
      exports: [CampaignApprovalQueueService, CampaignBatchService, CampaignSweepService],
    };
  }
}
