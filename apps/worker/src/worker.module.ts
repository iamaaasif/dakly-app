import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { StaffAlertDeliveryJob } from '@dakly/core/admin/jobs/staff-alert-delivery.job';
import { StaffAlertRelayJob } from '@dakly/core/admin/jobs/staff-alert-relay.job';
import { StaffAuditExportJob } from '@dakly/core/admin/jobs/staff-audit-export.job';
import { StaffAuditMaintenanceJob } from '@dakly/core/admin/jobs/staff-audit-maintenance.job';
import { StaffAlertsModule } from '@dakly/core/admin/staff-alerts.module';
import { StaffHistoryModule } from '@dakly/core/admin/staff-history.module';
import { SendDueSecurityNoticesJob } from '@dakly/core/auth/jobs/send-due-security-notices.job';
import { SendSecurityNoticeJob } from '@dakly/core/auth/jobs/send-security-notice.job';
import { SecurityNoticesModule } from '@dakly/core/auth/security-notices.module';
import { loadEnv } from '@dakly/core/platform/config/env';
import { DatabaseModule } from '@dakly/core/platform/database/database.module';
import { ErrorReportingModule } from '@dakly/core/platform/logging/error-reporting.module';
import { LoggingModule } from '@dakly/core/platform/logging/logging.module';
import {
  BulkJobDispatcher,
  TransactionalJobDispatcher,
} from '@dakly/core/platform/queue/job-dispatcher';
import { QUEUES } from '@dakly/core/platform/queue/queues';
import { toRedisConnection } from '@dakly/core/platform/queue/redis-connection';

import { JobSchedulers } from './job-schedulers';

@Module({
  providers: [
    BulkJobDispatcher,
    TransactionalJobDispatcher,
    StaffAuditExportJob,
    StaffAuditMaintenanceJob,
    StaffAlertDeliveryJob,
    StaffAlertRelayJob,
    SendDueSecurityNoticesJob,
    SendSecurityNoticeJob,
    JobSchedulers,
  ],
  imports: [
    DiscoveryModule,
    LoggingModule,
    ErrorReportingModule,
    StaffHistoryModule,
    StaffAlertsModule,
    BullModule.registerQueue({ name: QUEUES.transactional }),
    BullModule.registerQueue({ name: QUEUES.bulk }),
    DatabaseModule,
    SecurityNoticesModule,
    BullModule.forRootAsync({
      useFactory: () => ({ connection: toRedisConnection(loadEnv().REDIS_URL) }),
    }),
  ],
})
export class WorkerModule {}
