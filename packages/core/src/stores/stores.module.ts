import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../auth/users.module';
import { BillingModule } from '../billing/billing.module';
import { ClockModule } from '../platform/clock.module';
import { SessionsModule } from '../sessions/sessions.module';
import { TeamModule } from '../team/team.module';
import { MaintenanceStoresRepository } from './maintenance-stores.repository';
import { PlansController } from './plans.controller';
import { StoreSettingsController } from './store-settings.controller';
import { StoresController } from './stores.controller';
import { StoresRepository } from './stores.repository';
import { StoresService } from './stores.service';

@Module({
  imports: [UsersModule, AuditModule, BillingModule, SessionsModule, TeamModule, ClockModule],
  controllers: [StoresController, PlansController, StoreSettingsController],
  providers: [StoresService, StoresRepository, MaintenanceStoresRepository],
  exports: [StoresService],
})
export class StoresModule {}
