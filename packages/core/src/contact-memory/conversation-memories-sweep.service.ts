import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { Clock } from '../platform/clock';
import { QUEUES } from '../platform/queue/queues';
import { DAY_MS, HOUR_MS } from '../platform/time';
import { ContactMemoryRepository } from './contact-memory.repository';
import { UPDATE_CONVERSATION_MEMORY } from './jobs/update-conversation-memory.job';

@Injectable()
export class ConversationMemoriesSweepService {
  constructor(
    @Inject(ContactMemoryRepository) private readonly repository: ContactMemoryRepository,
    @Inject(Clock) private readonly clock: Clock,
    @InjectQueue(QUEUES.bulk) private readonly bulk: Queue,
  ) {}

  async enqueueDue(): Promise<void> {
    const now = this.clock.now();
    const due = await this.repository.dueConversations(now);
    if (!due.length) return;
    // One job per conversation per hour, so a conversation the model cannot read is not retried
    // every minute.
    const hour = Math.floor(now.getTime() / HOUR_MS);
    await this.bulk.addBulk(
      due.map((data) => ({
        name: UPDATE_CONVERSATION_MEMORY,
        data,
        opts: {
          jobId: `${UPDATE_CONVERSATION_MEMORY}-${data.conversationId}-${hour}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: { age: DAY_MS / 1000 },
          removeOnFail: 100,
        },
      })),
    );
  }
}
