import { Module } from '@nestjs/common';

import { AnalyticsReportsModule } from '../analytics/analytics-reports.module';
import { LinksModule } from '../links/links.module';
import { ClockModule } from '../platform/clock.module';
import { StoresModule } from '../stores/stores.module';
import { RunMaintenanceJob } from './jobs/run-maintenance.job';
import { MaintenanceRollupsRepository } from './maintenance-rollups.repository';
import { MaintenanceRollupsService } from './maintenance-rollups.service';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [AnalyticsReportsModule, LinksModule, StoresModule, ClockModule],
  providers: [
    MaintenanceRollupsRepository,
    MaintenanceRollupsService,
    MaintenanceService,
    RunMaintenanceJob,
  ],
})
export class MaintenanceModule {}
