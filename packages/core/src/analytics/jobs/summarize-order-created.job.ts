import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { orderCreatedEventSchema } from '@dakly/contracts/events/orders';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AnalyticsSummariesService } from '../analytics-summaries.service';

const event = orderCreatedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('order.created', { queue: QUEUES.transactional })
export class SummarizeOrderCreated implements JobHandler {
  constructor(
    @Inject(AnalyticsSummariesService) private readonly summaries: AnalyticsSummariesService,
  ) {}

  async handle(data: unknown) {
    const { id, occurredAt, storeId, payload } = event.parse(data);
    await this.summaries.refreshOrder(storeId, payload.orderId, { id, occurredAt });
  }
}
