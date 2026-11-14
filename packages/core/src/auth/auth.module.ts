import { TotpRecoveryController } from './totp-recovery.controller';
import { TotpRecoveryService } from './totp-recovery.service';
import { SecurityNoticesModule } from './security-notices.module';
import { TeamModule } from '../team/team.module';
import { TotpController } from './totp.controller';
import { TotpService } from './totp.service';
import { TotpRepository } from './totp.repository';
import { TotpCredentials } from './totp-credentials';
import { TotpChallenges } from './totp-challenges';
import { CryptoModule } from '../platform/crypto/crypto.module';
import { GoogleService } from './google.service';
import { GoogleIdentityService } from './google-identity.service';
import { GoogleTickets } from './google-tickets';
import { GoogleController } from './google.controller';
import { GOOGLE_IDENTITY_DRIVER, createGoogleIdentityDriver } from './google-provider';
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
import { CodesModule } from './codes.module';
import { SmsModule } from '../sms/sms.module';

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
