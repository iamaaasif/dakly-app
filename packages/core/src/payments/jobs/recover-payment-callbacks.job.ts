import { Inject } from '@nestjs/common';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { PaymentCallbacksService } from '../payment-callbacks.service';

export const RECOVER_PAYMENT_CALLBACKS = 'recover-payment-callbacks';

@HandlesJob({ queue: QUEUES.payments, name: RECOVER_PAYMENT_CALLBACKS })
export class RecoverPaymentCallbacksJob implements JobHandler {
  constructor(
    @Inject(PaymentCallbacksService) private readonly callbacks: PaymentCallbacksService,
  ) {}

  async handle() {
    await this.callbacks.recoverPending();
  }
}
