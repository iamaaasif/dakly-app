import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { contactMemoryRebuildRequestedEventSchema } from '@dakly/contracts/events/contacts';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ContactMemoryService } from '../contact-memory.service';

const jobData = contactMemoryRebuildRequestedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('contact_memory.rebuild_requested', { queue: QUEUES.aiReply })
export class RebuildContactMemory implements JobHandler {
  constructor(@Inject(ContactMemoryService) private readonly memory: ContactMemoryService) {}

  async handle(data: unknown) {
    const { storeId, payload } = jobData.parse(data);
    await this.memory.rebuild(storeId, payload.contactId);
  }
}
