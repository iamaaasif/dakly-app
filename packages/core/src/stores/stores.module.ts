import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import { SessionsModule } from '../sessions/sessions.module';
import { TeamModule } from '../team/team.module';
import { PlansController } from './plans.controller';
import { StoresController } from './stores.controller';
import { StoresRepository } from './stores.repository';
import { StoresService } from './stores.service';
@Module({
  imports: [AuditModule, BillingModule, SessionsModule, TeamModule],
  controllers: [StoresController, PlansController],
  providers: [StoresService, StoresRepository],
  exports: [StoresService],
})
export class StoresModule {}
