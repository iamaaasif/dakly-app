import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { loadEnv } from '../platform/config/env';
import { AiRateRepository } from './ai-rate.repository';
import { AI_DEFAULT_BDT_PER_USD, AiRateService } from './ai-rate.service';

@Module({
  imports: [ClockModule],
  providers: [
    AiRateRepository,
    AiRateService,
    { provide: AI_DEFAULT_BDT_PER_USD, useFactory: () => loadEnv().AI_USD_TO_BDT_RATE },
  ],
  exports: [AiRateService],
})
export class AiRateModule {}
