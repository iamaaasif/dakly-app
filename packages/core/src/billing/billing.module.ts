import { Module } from '@nestjs/common';

import { ClockModule } from '../platform/clock.module';
import { STORE_WRITABLE_CHECK } from '../platform/tenancy/writable-store.guard';
import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';

@Module({
  imports: [ClockModule],
  providers: [
    BillingRepository,
    BillingService,
    { provide: STORE_WRITABLE_CHECK, useExisting: BillingService },
  ],
  exports: [BillingRepository, BillingService, STORE_WRITABLE_CHECK],
})
export class BillingModule {}
