import { Module } from '@nestjs/common';

import { AutomationsModule } from '../automations/automations.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { SocialModule } from '../social/social.module';
import { AnalyticsChannelsService } from './analytics-channels.service';
import { AnalyticsOverviewService } from './analytics-overview.service';
import { AnalyticsReportsModule } from './analytics-reports.module';
import { AnalyticsTabsService } from './analytics-tabs.service';
import { AnalyticsController } from './analytics.controller';

// Campaigns and automations import AnalyticsReportsModule, so the screen reads live in its own module.
@Module({
  imports: [AnalyticsReportsModule, AutomationsModule, CampaignsModule, SocialModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsChannelsService, AnalyticsOverviewService, AnalyticsTabsService],
})
export class AnalyticsOverviewModule {}
