import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { ConversationMemoriesSweepService } from '../conversation-memories-sweep.service';

export const QUEUE_CONVERSATION_MEMORIES = 'queue-conversation-memories';
// The sweep finds quiet conversations across stores.
const payload = z.strictObject({});

@HandlesJob({ queue: QUEUES.bulk, name: QUEUE_CONVERSATION_MEMORIES })
export class QueueConversationMemoriesJob implements JobHandler {
  constructor(
    @Inject(ConversationMemoriesSweepService)
    private readonly sweep: ConversationMemoriesSweepService,
  ) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.sweep.enqueueDue();
  }
}
