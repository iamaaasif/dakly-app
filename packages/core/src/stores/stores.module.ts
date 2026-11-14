import { Module } from '@nestjs/common';
import { Clock } from '../platform/clock';
import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import { SessionsModule } from '../sessions/sessions.module';
import { TeamModule } from '../team/team.module';
import { PlansController } from './plans.controller';
import { StoreSettingsController } from './store-settings.controller';
import { StoresController } from './stores.controller';
import { StoresRepository } from './stores.repository';
import { StoresService } from './stores.service';
@Module({
  imports: [AuditModule, BillingModule, SessionsModule, TeamModule],
  controllers: [StoresController, PlansController, StoreSettingsController],
  providers: [StoresService, StoresRepository, Clock],
  exports: [StoresService],
})
export class StoresModule {}
