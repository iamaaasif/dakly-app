import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { ProviderHealthRepository } from './provider-health.repository';
import { ProviderHealthService } from './provider-health.service';

@Module({
  imports: [ClockModule],
  providers: [ProviderHealthRepository, ProviderHealthService],
  exports: [ProviderHealthService],
})
export class ProviderHealthModule {}
