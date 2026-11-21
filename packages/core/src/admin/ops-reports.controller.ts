import { Controller, Get, Inject, Query } from '@nestjs/common';

import {
  aiCostQuerySchema,
  type AiCostQuery,
  type AiCostResponse,
  type ProviderHealthResponse,
} from '@dakly/contracts/ops-reports';

import { AiCostService } from '../ai-cost/ai-cost.service';
import { StaffAccess } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ProviderHealthService } from '../provider-health/provider-health.service';
import { aiCostViewRoles, killSwitchViewRoles } from './support-roles';

@Controller('admin')
export class OpsReportsController {
  constructor(
    @Inject(ProviderHealthService) private readonly health: ProviderHealthService,
    @Inject(AiCostService) private readonly cost: AiCostService,
  ) {}

  @Get('provider-health')
  @StaffAccess(true, killSwitchViewRoles)
  providerHealth(): Promise<ProviderHealthResponse> {
    return this.health.report();
  }

  @Get('ai-cost')
  @StaffAccess(true, aiCostViewRoles)
  aiCost(
    @Query(new ZodValidationPipe(aiCostQuerySchema)) query: AiCostQuery,
  ): Promise<AiCostResponse> {
    return this.cost.report(query.day);
  }
}
