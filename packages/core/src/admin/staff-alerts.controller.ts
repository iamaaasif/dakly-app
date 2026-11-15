import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { staffAlertRetrySchema } from '@dakly/contracts/break-glass';
import { supportPageSchema } from '@dakly/contracts/support';
import { StaffAccess } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { StaffAlertsService } from './staff-alerts.service';
import type { StaffRequest } from './staff.guard';
@Controller('admin/alerts')
@StaffAccess(true, ['super_admin'])
export class StaffAlertsController {
  constructor(@Inject(StaffAlertsService) private readonly alerts: StaffAlertsService) {}
  @Get()
  list(
    @Req() request: StaffRequest,
    @Query(new ZodValidationPipe(supportPageSchema)) query: { before?: string },
  ) {
    return this.alerts.list(request.staff, query.before);
  }
  @Post(':id/retry')
  retry(
    @Req() request: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(staffAlertRetrySchema)) input: { reason: string },
  ) {
    return this.alerts.retry(request.staff, id, input.reason, request.ip);
  }
}
