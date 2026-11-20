import { Module } from '@nestjs/common';

import { AccountSecurityEventsModule } from '../account-security-events/account-security-events.module';
import { AnalyticsReportsModule } from '../analytics/analytics-reports.module';
import { AutomationRunsModule } from '../automations/automation-runs.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { LinksModule } from '../links/links.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClockModule } from '../platform/clock.module';
import { FileStorageModule } from '../platform/file-storage/file-storage.module';
import { SessionsModule } from '../sessions/sessions.module';
import { StoresModule } from '../stores/stores.module';
import { AuditArchiveRepository } from './audit-archive.repository';
import { AuditArchiveService } from './audit-archive.service';
import { FilePurgeRepository } from './file-purge.repository';
import { FilePurgeService } from './file-purge.service';
import { RunMaintenanceJob } from './jobs/run-maintenance.job';
import { MaintenanceRollupsRepository } from './maintenance-rollups.repository';
import { MaintenanceRollupsService } from './maintenance-rollups.service';
import { MaintenanceService } from './maintenance.service';
import { RetentionPurgeService } from './retention-purge.service';

@Module({
  imports: [
    AccountSecurityEventsModule,
    AnalyticsReportsModule,
    AutomationRunsModule,
    CampaignsModule,
    FileStorageModule,
    LinksModule,
    NotificationsModule,
    SessionsModule,
    StoresModule,
    ClockModule,
  ],
  providers: [
    AuditArchiveRepository,
    AuditArchiveService,
    FilePurgeRepository,
    FilePurgeService,
    RetentionPurgeService,
    MaintenanceRollupsRepository,
    MaintenanceRollupsService,
    MaintenanceService,
    RunMaintenanceJob,
  ],
})
export class MaintenanceModule {}
