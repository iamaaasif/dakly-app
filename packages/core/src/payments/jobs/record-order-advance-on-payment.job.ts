import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { paymentSucceededEventSchema } from '@dakly/contracts/events/payments';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { OrderPaymentLinksService } from '../order-payment-links.service';

const succeededEvent = paymentSucceededEventSchema.extend({ id: z.uuid() });

@HandlesEvent('payment.succeeded', { queue: QUEUES.payments })
export class RecordOrderAdvanceOnPayment implements JobHandler {
  constructor(@Inject(OrderPaymentLinksService) private readonly links: OrderPaymentLinksService) {}

  async handle(data: unknown) {
    const { storeId, payload } = succeededEvent.parse(data);
    await this.links.recordPaid(storeId, payload.paymentIntentId);
  }
}
