import { Module } from '@nestjs/common';

import { AccountSecurityEventsModule } from '../account-security-events/account-security-events.module';
import { AnalyticsReportsModule } from '../analytics/analytics-reports.module';
import { LinksModule } from '../links/links.module';
import { ClockModule } from '../platform/clock.module';
import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { StoresModule } from '../stores/stores.module';
import { AuditArchiveRepository } from './audit-archive.repository';
import { AuditArchiveService } from './audit-archive.service';
import { FilePurgeRepository } from './file-purge.repository';
import { FilePurgeService } from './file-purge.service';
import { RunMaintenanceJob } from './jobs/run-maintenance.job';
import { MaintenanceRollupsRepository } from './maintenance-rollups.repository';
import { MaintenanceRollupsService } from './maintenance-rollups.service';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [
    AccountSecurityEventsModule,
    AnalyticsReportsModule,
    FileStorageModule,
    LinksModule,
    StoresModule,
    ClockModule,
  ],
  providers: [
    AuditArchiveRepository,
    AuditArchiveService,
    FilePurgeRepository,
    FilePurgeService,
    MaintenanceRollupsRepository,
    MaintenanceRollupsService,
    MaintenanceService,
    RunMaintenanceJob,
  ],
})
export class MaintenanceModule {}
