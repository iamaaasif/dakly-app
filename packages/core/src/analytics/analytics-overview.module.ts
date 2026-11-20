import { Module } from '@nestjs/common';

import { AutomationsModule } from '../automations/automations.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { AnalyticsOverviewService } from './analytics-overview.service';
import { AnalyticsReportsModule } from './analytics-reports.module';
import { AnalyticsController } from './analytics.controller';

// Campaigns and automations import AnalyticsReportsModule, so the screen reads live in its own module.
@Module({
  imports: [AnalyticsReportsModule, AutomationsModule, CampaignsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsOverviewService],
})
export class AnalyticsOverviewModule {}
