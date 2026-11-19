import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { contactCreatedEventSchema } from '@dakly/contracts/events/contacts';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ContactStatsService } from '../contact-stats.service';

const event = contactCreatedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('contact.created', { queue: QUEUES.transactional })
export class RefreshContactStatsOnContactCreated implements JobHandler {
  constructor(@Inject(ContactStatsService) private readonly stats: ContactStatsService) {}

  async handle(data: unknown) {
    const { storeId, payload } = event.parse(data);
    await this.stats.refresh(storeId, payload.contactId);
  }
}
