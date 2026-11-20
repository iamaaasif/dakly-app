import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { paymentVerificationRequestedEventSchema } from '@dakly/contracts/events/payments';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { PaymentGatewayService } from '../payment-gateway.service';

const callbackEvent = paymentVerificationRequestedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('payment.verification_requested', { queue: QUEUES.payments })
export class VerifyPaymentOnCallback implements JobHandler {
  constructor(@Inject(PaymentGatewayService) private readonly payments: PaymentGatewayService) {}

  async handle(data: unknown) {
    const { storeId, payload } = callbackEvent.parse(data);
    await this.payments.verify(storeId, payload.paymentIntentId);
  }
}
