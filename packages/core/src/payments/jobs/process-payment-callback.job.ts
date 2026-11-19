import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { PaymentCallbackVerificationService } from '../payment-callback-verification.service';

export const PROCESS_PAYMENT_CALLBACK = 'process-payment-callback';

// Store routing starts only after the worker loads the global receipt.
const payload = z.strictObject({ webhookEventId: z.uuid() });

@HandlesJob({ queue: QUEUES.inbound, name: PROCESS_PAYMENT_CALLBACK })
export class ProcessPaymentCallbackJob implements JobHandler {
  constructor(
    @Inject(PaymentCallbackVerificationService)
    private readonly verification: PaymentCallbackVerificationService,
  ) {}

  async handle(data: unknown, finalAttempt: boolean) {
    await this.verification.process(payload.parse(data).webhookEventId, finalAttempt);
  }
}
