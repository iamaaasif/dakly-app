import { Module } from '@nestjs/common';

import { AccountRecoveryHistoryController } from './account-recovery-history.controller';
import { AccountSecurityEventsRepository } from './account-security-events.repository';
import { AccountSecurityEventsService } from './account-security-events.service';

@Module({
  controllers: [AccountRecoveryHistoryController],
  providers: [AccountSecurityEventsService, AccountSecurityEventsRepository],
  exports: [AccountSecurityEventsService],
})
export class AccountSecurityEventsModule {}
