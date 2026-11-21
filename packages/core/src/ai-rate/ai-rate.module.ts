import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { AiRateRepository } from './ai-rate.repository';
import { AiRateService } from './ai-rate.service';

@Module({
  imports: [ClockModule],
  providers: [AiRateRepository, AiRateService],
  exports: [AiRateService],
})
export class AiRateModule {}
