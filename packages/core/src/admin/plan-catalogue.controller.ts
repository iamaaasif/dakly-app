import { Body, Controller, Get, Inject, Param, Post, Put, Req } from '@nestjs/common';

import {
  createPlanSchema,
  retirePlanSchema,
  updatePlanSchema,
  type AdminPlan,
  type AdminPlansResponse,
  type CreatePlanInput,
  type RetirePlanInput,
  type UpdatePlanInput,
} from '@dakly/contracts/admin-plans';

import { BillingService } from '../billing/billing.service';
import { newId } from '../platform/database/new-id';
import { StaffAccess } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import type { StaffRequest } from './staff.guard';
import { planEditRoles, planViewRoles } from './support-roles';

@Controller('admin/plans')
export class PlanCatalogueController {
  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

  @Get()
  @StaffAccess(true, planViewRoles)
  list(): Promise<AdminPlansResponse> {
    return this.billing.catalogue().then((plans) => ({ plans }));
  }

  @Put(':code')
  @StaffAccess(true, planEditRoles)
  update(
    @Req() request: StaffRequest,
    @Param('code') code: string,
    @Body(new ZodValidationPipe(updatePlanSchema)) change: UpdatePlanInput,
  ): Promise<AdminPlan> {
    return this.billing.updatePlan({
      auditId: newId(),
      staffUserId: request.staff.id,
      code,
      change,
      ip: request.ip,
    });
  }

  @Post()
  @StaffAccess(true, planEditRoles)
  create(
    @Req() request: StaffRequest,
    @Body(new ZodValidationPipe(createPlanSchema)) change: CreatePlanInput,
  ): Promise<AdminPlan> {
    return this.billing.createPlan({
      id: newId(),
      auditId: newId(),
      staffUserId: request.staff.id,
      change,
      ip: request.ip,
    });
  }

  @Post(':code/retire')
  @StaffAccess(true, planEditRoles)
  retire(
    @Req() request: StaffRequest,
    @Param('code') code: string,
    @Body(new ZodValidationPipe(retirePlanSchema)) change: RetirePlanInput,
  ): Promise<AdminPlan> {
    return this.billing.retirePlan({
      auditId: newId(),
      staffUserId: request.staff.id,
      code,
      change,
      ip: request.ip,
    });
  }
}
