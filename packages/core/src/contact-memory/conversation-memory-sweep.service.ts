import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { Clock } from '../platform/clock';
import { QUEUES } from '../platform/queue/queues';
import { MINUTE_MS } from '../platform/time';
import { ContactMemoryRepository } from './contact-memory.repository';
import { UPDATE_CONVERSATION_MEMORY } from './jobs/update-conversation-memory.job';

@Injectable()
export class ConversationMemorySweepService {
  constructor(
    @Inject(ContactMemoryRepository) private readonly repository: ContactMemoryRepository,
    @Inject(Clock) private readonly clock: Clock,
    @InjectQueue(QUEUES.aiReply) private readonly queue: Queue,
  ) {}

  async enqueueDue(): Promise<void> {
    const now = this.clock.now();
    const due = await this.repository.dueConversations(now);
    if (!due.length) return;
    // A job id per conversation and quarter hour keeps the minute sweep from queueing it twice.
    const slot = Math.floor(now.getTime() / (15 * MINUTE_MS));
    await this.queue.addBulk(
      due.map((data) => ({
        name: UPDATE_CONVERSATION_MEMORY,
        data,
        opts: {
          jobId: `${UPDATE_CONVERSATION_MEMORY}-${data.conversationId}-${slot}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: MINUTE_MS },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      })),
    );
  }
}
