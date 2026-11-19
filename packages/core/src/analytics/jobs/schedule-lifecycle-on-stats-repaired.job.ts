import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { contactStatsRepairedEventSchema } from '@dakly/contracts/events/contacts';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AnalyticsReconciliationService } from '../analytics-reconciliation.service';

const event = contactStatsRepairedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('contact_stats.repaired', { queue: QUEUES.bulk })
export class ScheduleLifecycleOnStatsRepaired implements JobHandler {
  constructor(
    @Inject(AnalyticsReconciliationService) private readonly repair: AnalyticsReconciliationService,
  ) {}

  async handle(data: unknown) {
    const { storeId, payload } = event.parse(data);
    await this.repair.scheduleLifecycle(storeId, payload.day);
  }
}
