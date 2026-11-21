import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { contactDeletedEventSchema } from '@dakly/contracts/events/contacts';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ContactMemoryService } from '../contact-memory.service';

const event = contactDeletedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('contact.deleted', { queue: QUEUES.sync })
export class EraseMemoryOnContactDeleted implements JobHandler {
  constructor(@Inject(ContactMemoryService) private readonly memory: ContactMemoryService) {}

  async handle(data: unknown) {
    const { storeId, payload } = event.parse(data);
    await this.memory.eraseForDeletedContact(storeId, payload.contactId);
  }
}
