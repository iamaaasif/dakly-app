import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { paymentSucceededEventSchema } from '@dakly/contracts/events/payments';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { SubscriptionRenewalService } from '../subscription-renewal.service';

const paymentEvent = paymentSucceededEventSchema.extend({ id: z.uuid() });

// Every succeeded payment arrives here; the service ignores the ones that are not plan payments.
@HandlesEvent('payment.succeeded', { queue: QUEUES.payments })
export class ApplySubscriptionPayment implements JobHandler {
  constructor(
    @Inject(SubscriptionRenewalService) private readonly renewals: SubscriptionRenewalService,
  ) {}

  async handle(data: unknown) {
    const { storeId, payload } = paymentEvent.parse(data);
    await this.renewals.applyPayment(storeId, payload.paymentIntentId);
  }
}
