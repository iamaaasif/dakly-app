import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { contactLifecycleChangedEventSchema } from '@dakly/contracts/events/contacts';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AnalyticsReconciliationService } from '../analytics-reconciliation.service';

const event = contactLifecycleChangedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('contact.lifecycle_changed', { queue: QUEUES.transactional })
export class QueueLifecycleSnapshot implements JobHandler {
  constructor(
    @Inject(AnalyticsReconciliationService) private readonly repair: AnalyticsReconciliationService,
  ) {}

  async handle(data: unknown) {
    const { storeId } = event.parse(data);
    await this.repair.scheduleLifecycle(storeId);
  }
}
