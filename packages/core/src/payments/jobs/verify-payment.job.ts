import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { PaymentGatewayService } from '../payment-gateway.service';

export const VERIFY_PAYMENT = 'verify-payment';
const verifyPaymentSchema = z.strictObject({ storeId: z.uuid(), paymentIntentId: z.uuid() });

@HandlesJob({ queue: QUEUES.payments, name: VERIFY_PAYMENT })
export class VerifyPaymentJob implements JobHandler {
  constructor(@Inject(PaymentGatewayService) private readonly payments: PaymentGatewayService) {}

  async handle(data: unknown) {
    const { storeId, paymentIntentId } = verifyPaymentSchema.parse(data);
    await this.payments.verify(storeId, paymentIntentId);
  }
}
