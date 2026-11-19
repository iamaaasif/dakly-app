import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ConversationReturnsService } from '../conversation-returns.service';

export const QUEUE_CONVERSATION_RETURNS = 'queue-conversation-returns';
const payload = z.strictObject({});

@HandlesJob({ queue: QUEUES.sync, name: QUEUE_CONVERSATION_RETURNS })
export class QueueConversationReturnsJob implements JobHandler {
  constructor(
    @Inject(ConversationReturnsService) private readonly returns: ConversationReturnsService,
  ) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.returns.enqueueDue();
  }
}
