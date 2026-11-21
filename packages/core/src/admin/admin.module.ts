import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AccountSecurityEventsModule } from '../account-security-events/account-security-events.module';
import { AiCostModule } from '../ai-cost/ai-cost.module';
import { AiRateModule } from '../ai-rate/ai-rate.module';
import { AuditModule } from '../audit/audit.module';
import { CodesModule } from '../auth/codes.module';
import { SecurityNoticesModule } from '../auth/security-notices.module';
import { UsersModule } from '../auth/users.module';
import { BillingModule } from '../billing/billing.module';
import { ContactsModule } from '../contacts/contacts.module';
import { KillSwitchesModule } from '../kill-switches/kill-switches.module';
import { CacheModule } from '../platform/cache/cache.module';
import { ClockModule } from '../platform/clock.module';
import { CryptoModule } from '../platform/crypto/crypto.module';
import { TotpCredentials } from '../platform/crypto/totp-credentials';
import { ProviderHealthModule } from '../provider-health/provider-health.module';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { SessionsModule } from '../sessions/sessions.module';
import { SmsModule } from '../sms/sms.module';
import { SmsSendersModule } from '../sms-senders/sms-senders.module';
import { TeamModule } from '../team/team.module';
import { WalletsModule } from '../wallets/wallets.module';
import { AiRateController } from './ai-rate.controller';
import { BreakGlassController } from './break-glass.controller';
import { BreakGlassService } from './break-glass.service';
import { KillSwitchAdminService } from './kill-switch-admin.service';
import { KillSwitchController } from './kill-switch.controller';
import { OpsReportsController } from './ops-reports.controller';
import { OwnerRecoveryHistoryController } from './owner-recovery-history.controller';
import { OwnerSupportController } from './owner-support.controller';
import { PlanCatalogueController } from './plan-catalogue.controller';
import { ReconciliationController } from './reconciliation.controller';
import { RiskyActionConfirmation } from './risky-action-confirmation';
import { ShopsController } from './shops.controller';
import { ShopsRepository } from './shops.repository';
import { ShopsService } from './shops.service';
import { SmsSenderReviewController } from './sms-sender-review.controller';
import { SmsSenderReviewService } from './sms-sender-review.service';
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
import { StaffRecoveryHistoryService } from './staff-recovery-history.service';
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
import { WalletCreditController } from './wallet-credit.controller';
import { WalletCreditService } from './wallet-credit.service';

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
    ContactsModule,
    AuditModule,
    ClockModule,
    WalletsModule,
    SmsSendersModule,
    KillSwitchesModule,
    AiCostModule,
    AiRateModule,
    ProviderHealthModule,
    BillingModule,
    ReconciliationModule,
  ],
  controllers: [
    AiRateController,
    StaffRecoveryController,
    OwnerRecoveryHistoryController,
    StaffAuthController,
    BreakGlassController,
    StaffAlertsController,
    StaffSupportController,
    OwnerSupportController,
    SupportController,
    StaffHistoryController,
    WalletCreditController,
    SmsSenderReviewController,
    KillSwitchController,
    OpsReportsController,
    ShopsController,
    PlanCatalogueController,
    ReconciliationController,
  ],
  providers: [
    StaffRecoveryService,
    StaffRecoveryHistoryService,
    StaffRecoveryRepository,
    SupportRepository,
    RiskyActionConfirmation,
    BreakGlassService,
    WalletCreditService,
    SmsSenderReviewService,
    KillSwitchAdminService,
    ShopsRepository,
    ShopsService,
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
