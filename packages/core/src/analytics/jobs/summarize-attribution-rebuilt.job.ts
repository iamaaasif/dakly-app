import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { attributionOrdersRebuiltEventSchema } from '@dakly/contracts/events/analytics';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AnalyticsSummariesService } from '../analytics-summaries.service';

const event = attributionOrdersRebuiltEventSchema.extend({ id: z.uuid() });

@HandlesEvent('attribution.orders_rebuilt', { queue: QUEUES.sync })
export class SummarizeAttributionRebuilt implements JobHandler {
  constructor(
    @Inject(AnalyticsSummariesService) private readonly summaries: AnalyticsSummariesService,
  ) {}

  async handle(data: unknown) {
    const { storeId, payload } = event.parse(data);
    await this.summaries.refreshAttributionOrders(storeId, payload.orderIds);
  }
}
