import { Controller, Get, Inject, Query } from '@nestjs/common';

import {
  dashboardQuerySchema,
  type DashboardQuery,
  type DashboardResponse,
} from '@dakly/contracts/dashboard';
import type { StoreAccess } from '@dakly/contracts/team';

import { AnyMember } from '../platform/tenancy/access.decorators';
import { CurrentAccess } from '../platform/tenancy/current-access.decorator';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Get()
  @AnyMember()
  cards(
    @CurrentStore() storeId: string,
    @CurrentAccess() access: StoreAccess,
    @Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQuery,
  ): Promise<DashboardResponse> {
    return this.dashboard.cards(storeId, query, access);
  }
}
