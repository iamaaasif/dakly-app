import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { messageAttachmentsRequestedEventSchema } from '@dakly/contracts/events/messaging';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { InboundAttachmentsService } from '../inbound-attachments.service';

const jobData = messageAttachmentsRequestedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('message.attachments_requested', { queue: QUEUES.inbound, retryBackoffMs: 30_000 })
export class CopyMessageAttachmentsJob implements JobHandler {
  constructor(
    @Inject(InboundAttachmentsService) private readonly attachments: InboundAttachmentsService,
  ) {}

  async handle(data: unknown, finalAttempt: boolean) {
    const { storeId, payload } = jobData.parse(data);
    await this.attachments.copy(storeId, payload.messageId, finalAttempt);
  }
}
