import { Inject } from '@nestjs/common';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { PaymentJobsService } from '../payment-jobs.service';

export const SWEEP_PAYMENT_SETTLEMENTS = 'sweep-payment-settlements';

@HandlesJob({ queue: QUEUES.payments, name: SWEEP_PAYMENT_SETTLEMENTS })
export class SweepPaymentSettlementsJob implements JobHandler {
  constructor(@Inject(PaymentJobsService) private readonly payments: PaymentJobsService) {}

  // The nightly sweep queues one reconciliation per store.
  async handle() {
    await this.payments.scheduleSettlements();
  }
}
