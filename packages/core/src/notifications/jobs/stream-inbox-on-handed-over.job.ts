import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { conversationHandedOverEventSchema } from '@dakly/contracts/events/messaging';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { NotificationStreamService } from '../notification-stream.service';

// The relay adds the outbox row id to the event, which the strict event schema rejects.
const jobData = conversationHandedOverEventSchema.extend({ id: z.uuid() });

// Only a signal goes out; each open inbox reads that chat again. A repeat run is harmless.
@HandlesEvent('conversation.handed_over', { queue: QUEUES.transactional })
export class StreamInboxOnHandedOver implements JobHandler {
  constructor(
    @Inject(NotificationStreamService) private readonly stream: NotificationStreamService,
  ) {}

  async handle(data: unknown) {
    const { storeId, payload } = jobData.parse(data);
    await this.stream.announceInbox(storeId, payload.conversationId);
  }
}
