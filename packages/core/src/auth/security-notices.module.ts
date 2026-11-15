import { Module } from '@nestjs/common';

import { EmailModule } from '../email/email.module';
import { ClockModule } from '../platform/clock.module';
import { CryptoModule } from '../platform/crypto/crypto.module';
import { ErrorReportingModule } from '../platform/logging/error-reporting.module';
import { SmsModule } from '../sms/sms.module';
import { AccountRecoveryRepository } from './account-recovery.repository';
import { SecurityNoticesRepository } from './security-notices.repository';
import { SecurityNoticesService } from './security-notices.service';
import { UsersModule } from './users.module';

@Module({
  imports: [UsersModule, CryptoModule, EmailModule, SmsModule, ClockModule, ErrorReportingModule],
  providers: [AccountRecoveryRepository, SecurityNoticesRepository, SecurityNoticesService],
  exports: [AccountRecoveryRepository, SecurityNoticesService],
})
export class SecurityNoticesModule {}
