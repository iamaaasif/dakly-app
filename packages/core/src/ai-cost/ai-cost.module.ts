import { Module } from '@nestjs/common';

import { StaffAlertsModule } from '../admin/staff-alerts.module';
import { ClockModule } from '../platform/clock.module';
import { loadEnv } from '../platform/config/env';
import { AiCostRepository } from './ai-cost.repository';
import { AI_DAILY_COST_CEILING, AiCostService } from './ai-cost.service';

@Module({
  imports: [ClockModule, StaffAlertsModule],
  providers: [
    AiCostRepository,
    AiCostService,
    {
      provide: AI_DAILY_COST_CEILING,
      useFactory: () => loadEnv().AI_DAILY_STORE_COST_CEILING_MICRO_USD ?? null,
    },
  ],
  exports: [AiCostService],
})
export class AiCostModule {}
