import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { dueReminderRequestedEventSchema } from '@dakly/contracts/events/due-book';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { DueMessageDeliveryService } from '../due-message-delivery.service';

const event = dueReminderRequestedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('due.reminder_requested', { queue: QUEUES.transactional })
export class SendDueReminderOnRequested implements JobHandler {
  constructor(
    @Inject(DueMessageDeliveryService) private readonly delivery: DueMessageDeliveryService,
  ) {}

  async handle(data: unknown) {
    const {
      storeId,
      payload: { messageId },
    } = event.parse(data);
    await this.delivery.deliver(storeId, messageId);
  }
}
