import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { orderImportedEventSchema } from '@dakly/contracts/events/orders';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AnalyticsSummariesService } from '../analytics-summaries.service';

const event = orderImportedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('order.imported', { queue: QUEUES.sync })
export class SummarizeOrderImported implements JobHandler {
  constructor(
    @Inject(AnalyticsSummariesService) private readonly summaries: AnalyticsSummariesService,
  ) {}

  async handle(data: unknown) {
    const { storeId, payload } = event.parse(data);
    await this.summaries.refreshOrder(storeId, payload.orderId);
  }
}
