import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import {
  analyticsExportQuerySchema,
  analyticsQuerySchema,
  type AnalyticsAiAgentResponse,
  type AnalyticsAutomationsResponse,
  type AnalyticsCampaignsResponse,
  type AnalyticsChannelsResponse,
  type AnalyticsExportQuery,
  type AnalyticsOverviewResponse,
  type AnalyticsQuery,
  type AnalyticsSocialPostsResponse,
  type AnalyticsTipResponse,
} from '@dakly/contracts/analytics';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { AnalyticsAiAgentService } from './analytics-ai-agent.service';
import { AnalyticsChannelsService } from './analytics-channels.service';
import { AnalyticsExportService } from './analytics-export.service';
import { AnalyticsOverviewService } from './analytics-overview.service';
import { AnalyticsTabsService } from './analytics-tabs.service';
import { AnalyticsTipService } from './analytics-tip.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsOverviewService) private readonly overview: AnalyticsOverviewService,
    @Inject(AnalyticsTabsService) private readonly tabs: AnalyticsTabsService,
    @Inject(AnalyticsChannelsService) private readonly channelTabs: AnalyticsChannelsService,
    @Inject(AnalyticsAiAgentService) private readonly aiAgentReport: AnalyticsAiAgentService,
    @Inject(AnalyticsTipService) private readonly tips: AnalyticsTipService,
    @Inject(AnalyticsExportService) private readonly exports: AnalyticsExportService,
  ) {}

  @Get('overview')
  @RequirePermission('analytics.view')
  read(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ): Promise<AnalyticsOverviewResponse> {
    return this.overview.overview(storeId, query);
  }

  @Get('ai-agent')
  @RequirePermission('analytics.view')
  aiAgent(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ): Promise<AnalyticsAiAgentResponse> {
    return this.aiAgentReport.aiAgent(storeId, query);
  }

  @Get('campaigns')
  @RequirePermission('analytics.view')
  campaigns(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ): Promise<AnalyticsCampaignsResponse> {
    return this.tabs.campaignsTab(storeId, query);
  }

  @Get('automations')
  @RequirePermission('analytics.view')
  automations(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ): Promise<AnalyticsAutomationsResponse> {
    return this.tabs.automationsTab(storeId, query);
  }

  @Get('channels')
  @RequirePermission('analytics.view')
  channels(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ): Promise<AnalyticsChannelsResponse> {
    return this.channelTabs.channels(storeId, query);
  }

  @Get('social-posts')
  @RequirePermission('analytics.view')
  socialPosts(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ): Promise<AnalyticsSocialPostsResponse> {
    return this.channelTabs.socialPosts(storeId, query);
  }

  @Get('tip')
  @RequirePermission('analytics.view')
  tip(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ): Promise<AnalyticsTipResponse> {
    return this.tips.tip(storeId, query);
  }

  @Get('export')
  @RequirePermission('analytics.view')
  async export(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(analyticsExportQuerySchema)) query: AnalyticsExportQuery,
    @Res() reply: FastifyReply,
  ) {
    const { filename, body } = await this.exports.export(storeId, userId, query);
    return reply
      .header('Cache-Control', 'no-store')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .type('text/csv; charset=utf-8')
      .send(body);
  }
}
