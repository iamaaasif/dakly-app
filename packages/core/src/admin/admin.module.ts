import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AccountSecurityEventsModule } from '../account-security-events/account-security-events.module';
import { AuditModule } from '../audit/audit.module';
import { CodesModule } from '../auth/codes.module';
import { SecurityNoticesModule } from '../auth/security-notices.module';
import { UsersModule } from '../auth/users.module';
import { CustomersModule } from '../customers/customers.module';
import { CacheModule } from '../platform/cache/cache.module';
import { ClockModule } from '../platform/clock.module';
import { CryptoModule } from '../platform/crypto/crypto.module';
import { TotpCredentials } from '../platform/crypto/totp-credentials';
import { SessionsModule } from '../sessions/sessions.module';
import { SmsModule } from '../sms/sms.module';
import { TeamModule } from '../team/team.module';
import { BreakGlassController } from './break-glass.controller';
import { BreakGlassService } from './break-glass.service';
import { OwnerRecoveryHistoryController } from './owner-recovery-history.controller';
import { OwnerSupportController } from './owner-support.controller';
import { RiskyActionConfirmation } from './risky-action-confirmation';
import { StaffAccessService } from './staff-access.service';
import { StaffAlertsController } from './staff-alerts.controller';
import { StaffAlertsModule } from './staff-alerts.module';
import { StaffAttempts } from './staff-attempts';
import { StaffAuditRepository } from './staff-audit.repository';
import { StaffAuditService } from './staff-audit.service';
import { StaffAuthController } from './staff-auth.controller';
import { StaffAuthService } from './staff-auth.service';
import { StaffFactorsService } from './staff-factors.service';
import { StaffHistoryController } from './staff-history.controller';
import { StaffHistoryModule } from './staff-history.module';
import { StaffIdentityModule } from './staff-identity.module';
import { StaffRecoveryController } from './staff-recovery.controller';
import { StaffRecoveryRepository } from './staff-recovery.repository';
import { StaffRecoveryService } from './staff-recovery.service';
import { StaffSessionsService } from './staff-sessions.service';
import { StaffSupportController } from './staff-support.controller';
import { StaffTokens } from './staff-tokens';
import { StaffGuard } from './staff.guard';
import { StaffRepository } from './staff.repository';
import { SupportAuditService } from './support-audit.service';
import { SupportOwnerService } from './support-owner.service';
import { SupportController } from './support.controller';
import { SupportRepository } from './support.repository';
import { SupportService } from './support.service';

@Module({
  imports: [
    SecurityNoticesModule,
    SessionsModule,
    AccountSecurityEventsModule,
    StaffHistoryModule,
    StaffAlertsModule,
    StaffIdentityModule,
    CryptoModule,
    CacheModule,
    UsersModule,
    CodesModule,
    SmsModule,
    TeamModule,
    CustomersModule,
    AuditModule,
    ClockModule,
  ],
  controllers: [
    StaffRecoveryController,
    OwnerRecoveryHistoryController,
    StaffAuthController,
    BreakGlassController,
    StaffAlertsController,
    StaffSupportController,
    OwnerSupportController,
    SupportController,
    StaffHistoryController,
  ],
  providers: [
    StaffRecoveryService,
    StaffRecoveryRepository,
    SupportRepository,
    RiskyActionConfirmation,
    BreakGlassService,
    SupportService,
    SupportOwnerService,
    SupportAuditService,
    TotpCredentials,
    StaffRepository,
    StaffAuthService,
    StaffFactorsService,
    StaffSessionsService,
    StaffAccessService,
    StaffAuditService,
    StaffAuditRepository,
    StaffAttempts,
    StaffTokens,
    { provide: APP_GUARD, useClass: StaffGuard },
  ],
  exports: [StaffAccessService, StaffSessionsService, StaffAuditService],
})
export class AdminModule {}
