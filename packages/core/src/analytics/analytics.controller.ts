import { Controller, Get, Inject, Query } from '@nestjs/common';

import {
  analyticsQuerySchema,
  type AnalyticsOverviewResponse,
  type AnalyticsQuery,
} from '@dakly/contracts/analytics';

import { RequirePermission } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { AnalyticsOverviewService } from './analytics-overview.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsOverviewService) private readonly overview: AnalyticsOverviewService,
  ) {}

  @Get('overview')
  @RequirePermission('analytics.view')
  read(
    @CurrentStore() storeId: string,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ): Promise<AnalyticsOverviewResponse> {
    return this.overview.overview(storeId, query);
  }
}
