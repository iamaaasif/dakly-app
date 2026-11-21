import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';

import {
  settlementLineActionSchema,
  type ReconciliationLine,
  type ReconciliationQueueResponse,
  type SettlementLineActionInput,
} from '@dakly/contracts/admin-reconciliation';

import { newId } from '../platform/database/new-id';
import { StaffAccess } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import type { StaffRequest } from './staff.guard';
import { reconciliationEditRoles, reconciliationViewRoles } from './support-roles';

@Controller('admin/reconciliation')
export class ReconciliationController {
  constructor(
    @Inject(ReconciliationService) private readonly reconciliation: ReconciliationService,
  ) {}

  @Get()
  @StaffAccess(true, reconciliationViewRoles)
  list(): Promise<ReconciliationQueueResponse> {
    return this.reconciliation.queue().then((lines) => ({ lines }));
  }

  @Post('lines/:lineId')
  @StaffAccess(true, reconciliationEditRoles)
  close(
    @Req() request: StaffRequest,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body(new ZodValidationPipe(settlementLineActionSchema)) change: SettlementLineActionInput,
  ): Promise<ReconciliationLine> {
    return this.reconciliation.close({
      auditId: newId(),
      staffUserId: request.staff.id,
      lineId,
      change,
      ip: request.ip,
    });
  }
}
