import { PasswordService } from './password.service';
import { PasswordCredentials } from './password-credentials';
import { PasswordController } from './password.controller';
import { PasswordChangeController } from './password-change.controller';
import { Module } from '@nestjs/common';
import { CacheModule } from '../platform/cache/cache.module';
import { EmailModule } from '../email/email.module';
import { AccountSecurityEventsModule } from '../account-security-events/account-security-events.module';
import { EmailChangeService } from './email-change.service';
import { EmailChangeController } from './email-change.controller';
import { Clock } from '../platform/clock';
import { SessionsModule } from '../sessions/sessions.module';
import { UsersModule } from './users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SignInCodes } from './sign-in-codes';
import { SignInFailures } from './sign-in-failures';
import { SMS_DRIVER, createSmsDriver } from './sms-provider';

@Module({
  imports: [CacheModule, UsersModule, SessionsModule, EmailModule, AccountSecurityEventsModule],
  controllers: [
    AuthController,
    EmailChangeController,
    PasswordController,
    PasswordChangeController,
  ],
  providers: [
    PasswordService,
    PasswordCredentials,
    Clock,
    AuthService,
    EmailChangeService,
    SignInCodes,
    SignInFailures,
    { provide: SMS_DRIVER, useFactory: createSmsDriver },
  ],
  exports: [AuthService, SignInCodes, SignInFailures],
})
export class AuthModule {}
