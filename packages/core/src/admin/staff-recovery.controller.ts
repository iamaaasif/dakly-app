import { Body, Controller, Get, Header, HttpCode, Inject, Post, Query, Req } from '@nestjs/common';

import {
  accountSecurityHistorySchema,
  type AccountSecurityHistory,
} from '@dakly/contracts/account-security-events';
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

import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import { AnyMember, RequireUser, StaffAccess } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
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
@Controller('account-recovery-history')
@AnyMember()
export class OwnerRecoveryHistoryController {
  constructor(@Inject(StaffRecoveryService) private readonly recovery: StaffRecoveryService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  history(
    @CurrentStore() storeId: string,
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(accountSecurityHistorySchema)) query: AccountSecurityHistory,
  ) {
    return this.recovery.history(storeId, userId, query.before);
  }
}

@Controller('me/security-history')
@RequireUser()
export class AccountRecoveryHistoryController {
  constructor(
    @Inject(AccountSecurityEventsService) private readonly events: AccountSecurityEventsService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  history(
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(accountSecurityHistorySchema)) query: AccountSecurityHistory,
  ) {
    return this.events.history(userId, query.before);
  }
}
