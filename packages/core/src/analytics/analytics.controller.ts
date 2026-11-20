import { Controller, Get, Inject, Query } from '@nestjs/common';

import {
  analyticsQuerySchema,
  type AnalyticsAutomationsResponse,
  type AnalyticsCampaignsResponse,
  type AnalyticsChannelsResponse,
  type AnalyticsOverviewResponse,
  type AnalyticsQuery,
  type AnalyticsSocialPostsResponse,
} from '@dakly/contracts/analytics';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { AnalyticsChannelsService } from './analytics-channels.service';
import { AnalyticsOverviewService } from './analytics-overview.service';
import { AnalyticsTabsService } from './analytics-tabs.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsOverviewService) private readonly overview: AnalyticsOverviewService,
    @Inject(AnalyticsTabsService) private readonly tabs: AnalyticsTabsService,
    @Inject(AnalyticsChannelsService) private readonly channelTabs: AnalyticsChannelsService,
  ) {}

  @Get('overview')
  @RequirePermission('analytics.view')
  read(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ): Promise<AnalyticsOverviewResponse> {
    return this.overview.overview(storeId, query);
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
}
