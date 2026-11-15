import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { StaffAlertDeliveryJob } from '@dakly/core/admin/jobs/staff-alert-delivery.job';
import { StaffAlertRelayJob } from '@dakly/core/admin/jobs/staff-alert-relay.job';
import { StaffAuditExportJob } from '@dakly/core/admin/jobs/staff-audit-export.job';
import { StaffAuditMaintenanceJob } from '@dakly/core/admin/jobs/staff-audit-maintenance.job';
import { StaffAlertsModule } from '@dakly/core/admin/staff-alerts.module';
import { StaffHistoryModule } from '@dakly/core/admin/staff-history.module';
import { SecurityNoticesModule } from '@dakly/core/auth/security-notices.module';
import { loadEnv } from '@dakly/core/platform/config/env';
import { DatabaseModule } from '@dakly/core/platform/database/database.module';
import { LoggingModule } from '@dakly/core/platform/logging/logging.module';
import { QUEUES } from '@dakly/core/platform/queue/queues';
import { toRedisConnection } from '@dakly/core/platform/queue/redis-connection';

import { AccountSecurityNoticesJob } from './account-security-notices.job';

@Module({
  providers: [
    AccountSecurityNoticesJob,
    StaffAuditExportJob,
    StaffAuditMaintenanceJob,
    StaffAlertDeliveryJob,
    StaffAlertRelayJob,
  ],
  imports: [
    LoggingModule,
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
