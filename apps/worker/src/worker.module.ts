import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { StaffAlertDeliveryJob } from '@dakly/core/admin/jobs/staff-alert-delivery.job';
import { StaffAlertRelayJob } from '@dakly/core/admin/jobs/staff-alert-relay.job';
import { StaffAuditExportJob } from '@dakly/core/admin/jobs/staff-audit-export.job';
import { StaffAuditMaintenanceJob } from '@dakly/core/admin/jobs/staff-audit-maintenance.job';
import { StaffAlertsModule } from '@dakly/core/admin/staff-alerts.module';
import { StaffHistoryModule } from '@dakly/core/admin/staff-history.module';
import { KnowledgeIndexModule } from '@dakly/core/ai/knowledge/knowledge-index.module';
import { AnalyticsModule } from '@dakly/core/analytics/analytics.module';
import { SendDueSecurityNoticesJob } from '@dakly/core/auth/jobs/send-due-security-notices.job';
import { SendSecurityNoticeJob } from '@dakly/core/auth/jobs/send-security-notice.job';
import { SecurityNoticesModule } from '@dakly/core/auth/security-notices.module';
import { AutomationRunsModule } from '@dakly/core/automations/automation-runs.module';
import { AutomationsModule } from '@dakly/core/automations/automations.module';
import { ContinueAutomationRunJob } from '@dakly/core/automations/jobs/continue-automation-run.job';
import { RecordAutomationBirthdaysJob } from '@dakly/core/automations/jobs/record-automation-birthdays.job';
import { ResumeWorkflowsOnWalletCredited } from '@dakly/core/automations/jobs/resume-workflows-on-wallet-credited.job';
import { StartAutomationOnBirthday } from '@dakly/core/automations/jobs/start-automation-on-birthday.job';
import { StartAutomationOnConsent } from '@dakly/core/automations/jobs/start-automation-on-consent.job';
import { StartAutomationOnTagAdded } from '@dakly/core/automations/jobs/start-automation-on-tag-added.job';
import { SweepAutomationBirthdaysJob } from '@dakly/core/automations/jobs/sweep-automation-birthdays.job';
import { WakeDueRunsJob } from '@dakly/core/automations/jobs/wake-due-runs.job';
import { CampaignsModule } from '@dakly/core/campaigns/campaigns.module';
import { StartDueCampaignsJob } from '@dakly/core/campaigns/jobs/start-due-campaigns.job';
import { ChannelTokenHealthModule } from '@dakly/core/channels/channel-token-health.module';
import { MetaWebhookMaintenanceModule } from '@dakly/core/channels/meta-webhook-maintenance.module';
import { MetaWebhookRoutingModule } from '@dakly/core/channels/meta-webhook-routing.module';
import { ContactStatsRepairModule } from '@dakly/core/contacts/contact-stats-repair.module';
import { ImportsModule } from '@dakly/core/imports/imports.module';
import { FailStuckImportsJob } from '@dakly/core/imports/jobs/fail-stuck-imports.job';
import { RunContactImport } from '@dakly/core/imports/jobs/run-contact-import.job';
import { UndoContactImport } from '@dakly/core/imports/jobs/undo-contact-import.job';
import { ConversationReturnsModule } from '@dakly/core/messaging/conversation-returns.module';
import { SendMessageJob } from '@dakly/core/messaging/jobs/send-message.job';
import { MessagingModule } from '@dakly/core/messaging/messaging.module';
import { StreamNotificationOnCreated } from '@dakly/core/notifications/jobs/stream-notification-on-created.job';
import { WakeSnoozedNotificationsJob } from '@dakly/core/notifications/jobs/wake-snoozed-notifications.job';
import { NotificationsModule } from '@dakly/core/notifications/notifications.module';
import { PaymentJobsModule } from '@dakly/core/payments/payment-jobs.module';
import { ClockModule } from '@dakly/core/platform/clock.module';
import { loadEnv } from '@dakly/core/platform/config/env';
import { DatabaseModule } from '@dakly/core/platform/database/database.module';
import { ErrorReportingModule } from '@dakly/core/platform/logging/error-reporting.module';
import { LoggingModule } from '@dakly/core/platform/logging/logging.module';
import { RelayOutboxJob } from '@dakly/core/platform/outbox/jobs/relay-outbox.job';
import { OutboxRelayModule } from '@dakly/core/platform/outbox/outbox-relay.module';
import {
  BulkJobDispatcher,
  CampaignJobDispatcher,
  InboundJobDispatcher,
  OutboundJobDispatcher,
  PaymentsJobDispatcher,
  SyncJobDispatcher,
  TransactionalJobDispatcher,
  WorkflowJobDispatcher,
} from '@dakly/core/platform/queue/job-dispatcher';
import { QUEUES } from '@dakly/core/platform/queue/queues';
import { toRedisConnection } from '@dakly/core/platform/queue/redis-connection';

import { JobSchedulers } from './job-schedulers';

@Module({
  providers: [
    BulkJobDispatcher,
    CampaignJobDispatcher,
    InboundJobDispatcher,
    OutboundJobDispatcher,
    PaymentsJobDispatcher,
    SyncJobDispatcher,
    TransactionalJobDispatcher,
    WorkflowJobDispatcher,
    StaffAuditExportJob,
    StaffAuditMaintenanceJob,
    StaffAlertDeliveryJob,
    StaffAlertRelayJob,
    SendDueSecurityNoticesJob,
    SendSecurityNoticeJob,
    RelayOutboxJob,
    SendMessageJob,
    FailStuckImportsJob,
    RunContactImport,
    UndoContactImport,
    StreamNotificationOnCreated,
    WakeSnoozedNotificationsJob,
    WakeDueRunsJob,
    RecordAutomationBirthdaysJob,
    StartAutomationOnBirthday,
    StartAutomationOnConsent,
    SweepAutomationBirthdaysJob,
    StartAutomationOnTagAdded,
    StartDueCampaignsJob,
    ContinueAutomationRunJob,
    ResumeWorkflowsOnWalletCredited,
    JobSchedulers,
  ],
  imports: [
    DiscoveryModule,
    LoggingModule,
    ErrorReportingModule,
    StaffHistoryModule,
    StaffAlertsModule,
    BullModule.registerQueue({ name: QUEUES.inbound }),
    BullModule.registerQueue({ name: QUEUES.outbound }),
    BullModule.registerQueue({ name: QUEUES.sync }),
    BullModule.registerQueue({ name: QUEUES.transactional }),
    BullModule.registerQueue({ name: QUEUES.bulk }),
    BullModule.registerQueue({ name: QUEUES.workflow }),
    BullModule.registerQueue({ name: QUEUES.campaign }),
    BullModule.registerQueue({ name: QUEUES.payments }),
    DatabaseModule,
    SecurityNoticesModule,
    OutboxRelayModule,
    NotificationsModule,
    MetaWebhookRoutingModule,
    MetaWebhookMaintenanceModule,
    MessagingModule,
    ChannelTokenHealthModule,
    ConversationReturnsModule,
    AutomationRunsModule,
    AutomationsModule,
    CampaignsModule,
    ClockModule,
    ImportsModule,
    ContactStatsRepairModule,
    AnalyticsModule,
    PaymentJobsModule,
    KnowledgeIndexModule,
    BullModule.forRootAsync({
      useFactory: () => {
        const env = loadEnv();
        return { connection: toRedisConnection(env.REDIS_URL), prefix: env.QUEUE_PREFIX };
      },
    }),
  ],
})
export class WorkerModule {}
