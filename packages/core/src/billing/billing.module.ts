import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';

@Module({
  imports: [ClockModule],
  providers: [BillingRepository, BillingService],
  exports: [BillingRepository, BillingService],
})
export class BillingModule {}
