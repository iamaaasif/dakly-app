import { QUEUES } from '@dakly/core/platform/queue/queues';
import { StaffHistoryModule } from '@dakly/core/admin/staff-history.module';
import { StaffAuditExportJob } from '@dakly/core/admin/jobs/staff-audit-export.job';
import { StaffAuditMaintenanceJob } from '@dakly/core/admin/jobs/staff-audit-maintenance.job';
import { LoggingModule } from '@dakly/core/platform/logging/logging.module';
import { SecurityNoticesModule } from '@dakly/core/auth/security-notices.module';
import { AccountSecurityNoticesJob } from './account-security-notices.job';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { loadEnv } from '@dakly/core/platform/config/env';
import { DatabaseModule } from '@dakly/core/platform/database/database.module';
import { toRedisConnection } from '@dakly/core/platform/queue/redis-connection';

@Module({
  providers: [AccountSecurityNoticesJob, StaffAuditExportJob, StaffAuditMaintenanceJob],
  imports: [
    LoggingModule,
    StaffHistoryModule,
    BullModule.registerQueue({ name: QUEUES.bulk }),
    DatabaseModule,
    SecurityNoticesModule,
    BullModule.forRootAsync({
      useFactory: () => ({ connection: toRedisConnection(loadEnv().REDIS_URL) }),
    }),
  ],
})
export class WorkerModule {}
