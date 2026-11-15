import { Module } from '@nestjs/common';

import { AccountSecurityEventsRepository } from './account-security-events.repository';
import { AccountSecurityEventsService } from './account-security-events.service';

@Module({
  providers: [AccountSecurityEventsService, AccountSecurityEventsRepository],
  exports: [AccountSecurityEventsService],
})
export class AccountSecurityEventsModule {}
