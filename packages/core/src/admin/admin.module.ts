import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
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
  imports: [CryptoModule, CacheModule],
  controllers: [StaffAuthController],
  providers: [
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
