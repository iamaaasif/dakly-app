import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../audit/audit.module';
import { AutomationsModule } from '../automations/automations.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { SocialModule } from '../social/social.module';
import { AnalyticsChannelsService } from './analytics-channels.service';
import { AnalyticsExportService } from './analytics-export.service';
import { AnalyticsOverviewService } from './analytics-overview.service';
import { AnalyticsReportsModule } from './analytics-reports.module';
import { AnalyticsTabsService } from './analytics-tabs.service';
import { AnalyticsTipService } from './analytics-tip.service';
import { AnalyticsController } from './analytics.controller';

// Campaigns and automations import AnalyticsReportsModule, so the screen reads live in its own module.
@Module({
  imports: [
    AiModule,
    AnalyticsReportsModule,
    AuditModule,
    AutomationsModule,
    CampaignsModule,
    SocialModule,
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsChannelsService,
    AnalyticsExportService,
    AnalyticsOverviewService,
    AnalyticsTabsService,
    AnalyticsTipService,
  ],
})
export class AnalyticsOverviewModule {}
