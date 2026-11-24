import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { messageReceivedEventSchema } from '@dakly/contracts/events/messaging';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ContactProfileService } from '../contact-profile.service';

const event = messageReceivedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('message.received', { queue: QUEUES.inbound, retryBackoffMs: 30_000 })
export class FetchContactProfileJob implements JobHandler {
  constructor(@Inject(ContactProfileService) private readonly profiles: ContactProfileService) {}

  async handle(data: unknown) {
    const { storeId, payload } = event.parse(data);
    await this.profiles.fetchName(storeId, payload.contactId);
  }
}
