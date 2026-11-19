import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { Clock } from '../platform/clock';
import { QUEUES } from '../platform/queue/queues';
import { MINUTE_MS } from '../platform/time';
import { InboxRepository } from './inbox.repository';
import { RETURN_CONVERSATION_TO_AI } from './jobs/return-conversation-to-ai.job';

@Injectable()
export class ConversationReturnsService {
  constructor(
    @Inject(InboxRepository) private readonly repository: InboxRepository,
    @Inject(Clock) private readonly clock: Clock,
    @InjectQueue(QUEUES.sync) private readonly queue: Queue,
  ) {}

  async enqueueDue(): Promise<void> {
    const now = this.clock.now();
    const due = await this.repository.dueReturns(now);
    if (!due.length) return;
    const minute = Math.floor(now.getTime() / MINUTE_MS);
    await this.queue.addBulk(
      due.map((data) => ({
        name: RETURN_CONVERSATION_TO_AI,
        data,
        opts: {
          jobId: `${RETURN_CONVERSATION_TO_AI}-${data.conversationId}-${minute}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      })),
    );
  }
}
