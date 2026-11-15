import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  StaffRecoveryController,
  OwnerRecoveryHistoryController,
  AccountRecoveryHistoryController,
} from './staff-recovery.controller';
import { StaffRecoveryService } from './staff-recovery.service';
import { StaffRecoveryRepository } from './staff-recovery.repository';
import { SecurityNoticesModule } from '../auth/security-notices.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AccountSecurityEventsModule } from '../account-security-events/account-security-events.module';
import { BreakGlassService } from './break-glass.service';
import { BreakGlassController } from './break-glass.controller';
import { RiskyActionConfirmation } from './risky-action-confirmation';
import { StaffAlertsModule } from './staff-alerts.module';
import { StaffAlertsController } from './staff-alerts.controller';
import { SupportAuditService } from './support-audit.service';
import { UsersModule } from '../auth/users.module';
import { CodesModule } from '../auth/codes.module';
import { SmsModule } from '../sms/sms.module';
import { TeamModule } from '../team/team.module';
import { CustomersModule } from '../customers/customers.module';
import { AuditModule } from '../audit/audit.module';
import { StaffIdentityModule } from './staff-identity.module';
import { SupportRepository } from './support.repository';
import { SupportService } from './support.service';
import { SupportOwnerService } from './support-owner.service';
import {
  StaffSupportController,
  OwnerSupportController,
  SupportController,
} from './support.controller';
import { StaffHistoryModule } from './staff-history.module';
import { StaffHistoryController } from './staff-history.controller';
import { CryptoModule } from '../platform/crypto/crypto.module';
import { TotpCredentials } from '../platform/crypto/totp-credentials';
import { CacheModule } from '../platform/cache/cache.module';
import { Clock } from '../platform/clock';
import { StaffRepository } from './staff.repository';
import { StaffAuthService } from './staff-auth.service';
import { StaffFactorsService } from './staff-factors.service';
import { StaffSessionsService } from './staff-sessions.service';
import { StaffAccessService } from './staff-access.service';
import { StaffAuditService } from './staff-audit.service';
import { StaffAuditRepository } from './staff-audit.repository';
import { StaffAttempts } from './staff-attempts';
import { StaffTokens } from './staff-tokens';
import { StaffGuard } from './staff.guard';
import { StaffAuthController } from './staff-auth.controller';
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
  ],
  controllers: [
    StaffRecoveryController,
    OwnerRecoveryHistoryController,
    AccountRecoveryHistoryController,
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
    Clock,
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
