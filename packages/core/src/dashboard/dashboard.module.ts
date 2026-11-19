import { Module } from '@nestjs/common';

import { AnalyticsReportsModule } from '../analytics/analytics-reports.module';
import { TeamModule } from '../team/team.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AnalyticsReportsModule, TeamModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
