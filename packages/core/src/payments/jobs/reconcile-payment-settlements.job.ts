import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { PaymentJobsService, RECONCILE_PAYMENT_SETTLEMENTS } from '../payment-jobs.service';

const settlementPageSchema = z.strictObject({
  storeId: z.uuid(),
  day: z.iso.date(),
  after: z.uuid().nullable(),
});

@HandlesJob({ queue: QUEUES.payments, name: RECONCILE_PAYMENT_SETTLEMENTS })
export class ReconcilePaymentSettlementsJob implements JobHandler {
  constructor(@Inject(PaymentJobsService) private readonly payments: PaymentJobsService) {}

  async handle(data: unknown) {
    const { storeId, day, after } = settlementPageSchema.parse(data);
    await this.payments.reconcile(storeId, day, after);
  }
}
