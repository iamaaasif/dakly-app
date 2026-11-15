import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';

import {
  staffRecoveryLookupSchema,
  type StaffRecoveryLookup,
  staffRecoveryRequestSchema,
  staffRecoveryCodeSchema,
  staffRecoveryConfirmationSchema,
  type StaffRecoveryRequest,
  type StaffRecoveryCode,
  type StaffRecoveryConfirmation,
} from '@dakly/contracts/staff-recovery';

import { StaffAccess } from '../platform/tenancy/access.decorators';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { StaffRecoveryService } from './staff-recovery.service';
import type { StaffRequest } from './staff.guard';

@Controller('admin/account-recovery')
@StaffAccess(true, ['support', 'super_admin'])
export class StaffRecoveryController {
  constructor(@Inject(StaffRecoveryService) private readonly recovery: StaffRecoveryService) {}
  @Post('lookup')
  lookup(
    @Req() request: StaffRequest,
    @Body(new ZodValidationPipe(staffRecoveryLookupSchema)) input: StaffRecoveryLookup,
  ) {
    return this.recovery.lookup(request.staff, input.identifier);
  }

  @Post('preview')
  preview(
    @Req() request: StaffRequest,
    @Body(new ZodValidationPipe(staffRecoveryRequestSchema)) input: StaffRecoveryRequest,
  ) {
    return this.recovery.preview(request.staff, input);
  }

  @Post('code')
  @HttpCode(204)
  code(
    @Req() request: StaffRequest,
    @Body(new ZodValidationPipe(staffRecoveryCodeSchema)) input: StaffRecoveryCode,
  ) {
    return this.recovery.requestCode(request.staff, input, request.ip);
  }

  @Post()
  recover(
    @Req() request: StaffRequest,
    @Body(new ZodValidationPipe(staffRecoveryConfirmationSchema)) input: StaffRecoveryConfirmation,
  ) {
    return this.recovery.recover(request.staff, input, request.ip);
  }
}
