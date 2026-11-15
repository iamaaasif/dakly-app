import { ErrorReporter } from '../platform/logging/error-reporter';
import { loadEnv } from '../platform/config/env';
import { Module } from '@nestjs/common';
import { UsersModule } from './users.module';
import { CryptoModule } from '../platform/crypto/crypto.module';
import { EmailModule } from '../email/email.module';
import { SmsModule } from '../sms/sms.module';
import { Clock } from '../platform/clock';
import { AccountRecoveryRepository } from './account-recovery.repository';
import { SecurityNoticesRepository } from './security-notices.repository';
import { SecurityNoticesService } from './security-notices.service';
@Module({
  imports: [UsersModule, CryptoModule, EmailModule, SmsModule],
  providers: [
    { provide: ErrorReporter, useFactory: () => new ErrorReporter(loadEnv().SENTRY_DSN) },
    Clock,
    AccountRecoveryRepository,
    SecurityNoticesRepository,
    SecurityNoticesService,
  ],
  exports: [AccountRecoveryRepository, SecurityNoticesService],
})
export class SecurityNoticesModule {}
