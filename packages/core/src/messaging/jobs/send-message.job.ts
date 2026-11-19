import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { messageSendRequestedEventSchema } from '@dakly/contracts/events/messaging';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { MessagingService } from '../messaging.service';

const jobData = messageSendRequestedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('message.send_requested', { queue: QUEUES.outbound })
export class SendMessageJob implements JobHandler {
  constructor(@Inject(MessagingService) private readonly messaging: MessagingService) {}

  async handle(data: unknown) {
    const { storeId, payload } = jobData.parse(data);
    await this.messaging.sendQueuedMessage(storeId, payload.messageId);
  }
}
