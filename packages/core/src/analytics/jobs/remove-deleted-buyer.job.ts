import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { contactDeletedEventSchema } from '@dakly/contracts/events/contacts';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AnalyticsSummariesService } from '../analytics-summaries.service';

const event = contactDeletedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('contact.deleted', { queue: QUEUES.sync })
export class RemoveDeletedBuyer implements JobHandler {
  constructor(
    @Inject(AnalyticsSummariesService) private readonly summaries: AnalyticsSummariesService,
  ) {}

  async handle(data: unknown) {
    const { storeId, payload } = event.parse(data);
    await this.summaries.removeBuyer(storeId, payload.contactId);
  }
}
