import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { contactMergedEventSchema } from '@dakly/contracts/events/contacts';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ContactStatsService } from '../contact-stats.service';

const event = contactMergedEventSchema.extend({ id: z.uuid() });

// The orders moved between the two contacts, so both totals change.
@HandlesEvent('contact.merged', { queue: QUEUES.transactional })
export class RefreshContactStatsOnContactMerged implements JobHandler {
  constructor(@Inject(ContactStatsService) private readonly stats: ContactStatsService) {}

  async handle(data: unknown) {
    const { storeId, payload } = event.parse(data);
    await this.stats.refresh(storeId, payload.keptContactId);
    await this.stats.refresh(storeId, payload.mergedContactId);
  }
}
