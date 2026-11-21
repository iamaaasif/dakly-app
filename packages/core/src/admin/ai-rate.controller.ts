import { Body, Controller, Get, Inject, Put, Req } from '@nestjs/common';

import {
  changeAiRateSchema,
  type AiRateResponse,
  type ChangeAiRateInput,
} from '@dakly/contracts/ai-rate';

import { AiRateService } from '../ai-rate/ai-rate.service';
import { StaffAccess } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import type { StaffRequest } from './staff.guard';
import { aiCostViewRoles, reconciliationEditRoles } from './support-roles';

@Controller('admin/ai-rate')
export class AiRateController {
  constructor(@Inject(AiRateService) private readonly rate: AiRateService) {}

  @Get()
  @StaffAccess(true, aiCostViewRoles)
  read(): Promise<AiRateResponse> {
    return this.rate.current();
  }

  // Finance owns money rules; the change applies to runs saved from now on and never rewrites old ones.
  @Put()
  @StaffAccess(true, reconciliationEditRoles)
  change(
    @Req() request: StaffRequest,
    @Body(new ZodValidationPipe(changeAiRateSchema)) input: ChangeAiRateInput,
  ): Promise<AiRateResponse> {
    return this.rate.change({
      staffUserId: request.staff.id,
      poishaPerUsd: input.poishaPerUsd,
      reason: input.reason,
      ip: request.ip,
    });
  }
}
