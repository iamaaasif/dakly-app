import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ConversationMemorySweepService } from '../conversation-memory-sweep.service';

export const QUEUE_CONVERSATION_MEMORY_UPDATES = 'queue-conversation-memory-updates';
// The sweep finds quiet conversations across stores.
const payload = z.strictObject({});

@HandlesJob({ queue: QUEUES.sync, name: QUEUE_CONVERSATION_MEMORY_UPDATES })
export class QueueConversationMemoryUpdatesJob implements JobHandler {
  constructor(
    @Inject(ConversationMemorySweepService)
    private readonly sweep: ConversationMemorySweepService,
  ) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.sweep.enqueueDue();
  }
}
