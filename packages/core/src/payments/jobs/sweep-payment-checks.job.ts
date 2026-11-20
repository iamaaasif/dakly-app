import { Inject } from '@nestjs/common';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { PaymentJobsService } from '../payment-jobs.service';

export const SWEEP_PAYMENT_CHECKS = 'sweep-payment-checks';

@HandlesJob({ queue: QUEUES.payments, name: SWEEP_PAYMENT_CHECKS })
export class SweepPaymentChecksJob implements JobHandler {
  constructor(@Inject(PaymentJobsService) private readonly payments: PaymentJobsService) {}

  // This sweep finds due work across stores.
  async handle() {
    await this.payments.scheduleChecks();
  }
}
