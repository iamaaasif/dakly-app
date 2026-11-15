import { Controller, Get, Header, Inject, Query } from '@nestjs/common';

import {
  accountSecurityHistorySchema,
  type AccountSecurityHistory,
} from '@dakly/contracts/account-security-events';

import { AnyMember } from '../platform/tenancy/access.decorators';
import { CurrentStore } from '../platform/tenancy/current-store.decorator';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { StaffRecoveryHistoryService } from './staff-recovery-history.service';

@Controller('account-recovery-history')
@AnyMember()
export class OwnerRecoveryHistoryController {
  constructor(
    @Inject(StaffRecoveryHistoryService) private readonly recovery: StaffRecoveryHistoryService,
  ) {}

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
