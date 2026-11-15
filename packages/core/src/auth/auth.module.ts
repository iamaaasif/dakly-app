import { Module } from '@nestjs/common';

import { AccountSecurityEventsModule } from '../account-security-events/account-security-events.module';
import { EmailModule } from '../email/email.module';
import { CacheModule } from '../platform/cache/cache.module';
import { Clock } from '../platform/clock';
import { CryptoModule } from '../platform/crypto/crypto.module';
import { TotpCredentials } from '../platform/crypto/totp-credentials';
import { SessionsModule } from '../sessions/sessions.module';
import { SmsModule } from '../sms/sms.module';
import { TeamModule } from '../team/team.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CodesModule } from './codes.module';
import { EmailChangeController } from './email-change.controller';
import { EmailChangeService } from './email-change.service';
import { GoogleIdentityService } from './google-identity.service';
import { GOOGLE_IDENTITY_DRIVER, createGoogleIdentityDriver } from './google-provider';
import { GoogleTickets } from './google-tickets';
import { GoogleController } from './google.controller';
import { GoogleService } from './google.service';
import { PasswordChangeController } from './password-change.controller';
import { PasswordCredentials } from './password-credentials';
import { PasswordController } from './password.controller';
import { PasswordService } from './password.service';
import { SecurityNoticesModule } from './security-notices.module';
import { TotpChallenges } from './totp-challenges';
import { TotpRecoveryController } from './totp-recovery.controller';
import { TotpRecoveryService } from './totp-recovery.service';
import { TotpController } from './totp.controller';
import { TotpRepository } from './totp.repository';
import { TotpService } from './totp.service';
import { UsersModule } from './users.module';

@Module({
  imports: [
    CryptoModule,
    SecurityNoticesModule,
    TeamModule,
    CacheModule,
    CodesModule,
    UsersModule,
    SessionsModule,
    EmailModule,
    SmsModule,
    AccountSecurityEventsModule,
  ],
  controllers: [
    TotpController,
    TotpRecoveryController,
    AuthController,
    GoogleController,
    EmailChangeController,
    PasswordController,
    PasswordChangeController,
  ],
  providers: [
    TotpRecoveryService,
    TotpService,
    TotpRepository,
    TotpCredentials,
    TotpChallenges,
    GoogleService,
    GoogleIdentityService,
    GoogleTickets,
    { provide: GOOGLE_IDENTITY_DRIVER, useFactory: createGoogleIdentityDriver },
    PasswordService,
    PasswordCredentials,
    Clock,
    AuthService,
    EmailChangeService,
  ],
  exports: [AuthService, CodesModule],
})
export class AuthModule {}
