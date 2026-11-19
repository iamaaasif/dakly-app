import { Module } from '@nestjs/common';

import { AnalyticsModule } from '../analytics/analytics.module';
import { TeamModule } from '../team/team.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AnalyticsModule, TeamModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
