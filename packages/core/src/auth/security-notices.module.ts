import { Module } from '@nestjs/common';

import { EmailModule } from '../email/email.module';
import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { CryptoModule } from '../platform/crypto/crypto.module';
import { ErrorReporter } from '../platform/logging/error-reporter';
import { SmsModule } from '../sms/sms.module';
import { AccountRecoveryRepository } from './account-recovery.repository';
import { SecurityNoticesRepository } from './security-notices.repository';
import { SecurityNoticesService } from './security-notices.service';
import { UsersModule } from './users.module';

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
