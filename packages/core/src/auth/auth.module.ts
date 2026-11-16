import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AccountSecurityEventsModule } from '../account-security-events/account-security-events.module';
import { EmailModule } from '../email/email.module';
import { CacheModule } from '../platform/cache/cache.module';
import { ClockModule } from '../platform/clock.module';
import { loadEnv } from '../platform/config/env';
import { CryptoModule } from '../platform/crypto/crypto.module';
import { TotpCredentials } from '../platform/crypto/totp-credentials';
import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
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
import { SignInCodeFlowService } from './sign-in-code-flow.service';
import { TotpChallenges } from './totp-challenges';
import { TotpRecoveryFinishService } from './totp-recovery-finish.service';
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
    ClockModule,
    // Sign-in and recovery queue notice delivery for the worker.
    BullModule.registerQueueAsync({
      name: QUEUES.transactional,
      useFactory: () => {
        const env = loadEnv();
        return { connection: toRedisConnection(env.REDIS_URL), prefix: env.QUEUE_PREFIX };
      },
    }),
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
    TotpRecoveryFinishService,
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
    AuthService,
    SignInCodeFlowService,
    EmailChangeService,
  ],
  exports: [AuthService, CodesModule],
})
export class AuthModule {}
