import { Controller, Get, Header, Inject, Query } from '@nestjs/common';

import {
  accountSecurityHistorySchema,
  type AccountSecurityHistory,
} from '@dakly/contracts/account-security-events';

import { RequireUser } from '../platform/tenancy/access.decorators';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { AccountSecurityEventsService } from './account-security-events.service';

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
