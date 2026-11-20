import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { orderCreatedEventSchema } from '@dakly/contracts/events/orders';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { OrderAttributionEngine } from '../order-attribution-engine.service';

const event = orderCreatedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('order.created', { queue: QUEUES.sync })
export class AttributeOrderCreated implements JobHandler {
  constructor(@Inject(OrderAttributionEngine) private readonly engine: OrderAttributionEngine) {}

  async handle(data: unknown) {
    const { storeId, payload } = event.parse(data);
    await this.engine.attribute(storeId, payload.orderId);
  }
}
