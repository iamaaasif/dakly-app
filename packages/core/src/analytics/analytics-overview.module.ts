import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../audit/audit.module';
import { AutomationsModule } from '../automations/automations.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { AiChatReportModule } from '../messaging/ai-chat-report.module';
import { CacheModule } from '../platform/cache/cache.module';
import { SocialModule } from '../social/social.module';
import { AnalyticsAiAgentService } from './analytics-ai-agent.service';
import { AnalyticsChannelsService } from './analytics-channels.service';
import { AnalyticsExportService } from './analytics-export.service';
import { AnalyticsOverviewService } from './analytics-overview.service';
import { AnalyticsProfitService } from './analytics-profit.service';
import { AnalyticsReportsModule } from './analytics-reports.module';
import { AnalyticsTabsService } from './analytics-tabs.service';
import { AnalyticsTipService } from './analytics-tip.service';
import { AnalyticsController } from './analytics.controller';

// Campaigns and automations import AnalyticsReportsModule, so the screen reads live in its own module.
@Module({
  imports: [
    AiChatReportModule,
    AiModule,
    AnalyticsReportsModule,
    AuditModule,
    AutomationsModule,
    CacheModule,
    CampaignsModule,
    SocialModule,
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsAiAgentService,
    AnalyticsChannelsService,
    AnalyticsExportService,
    AnalyticsOverviewService,
    AnalyticsProfitService,
    AnalyticsTabsService,
    AnalyticsTipService,
  ],
})
export class AnalyticsOverviewModule {}
