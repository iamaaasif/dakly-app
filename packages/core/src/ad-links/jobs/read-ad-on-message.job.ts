import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { messageReceivedEventSchema } from '@dakly/contracts/events/messaging';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { AdReadingService } from '../ad-reading.service';

const jobData = messageReceivedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('message.received', { queue: QUEUES.inbound, retryBackoffMs: 30_000 })
export class ReadAdOnMessageJob implements JobHandler {
  constructor(@Inject(AdReadingService) private readonly reading: AdReadingService) {}

  async handle(data: unknown) {
    const { storeId, payload } = jobData.parse(data);
    await this.reading.readFromChat(storeId, payload.conversationId);
  }
}
