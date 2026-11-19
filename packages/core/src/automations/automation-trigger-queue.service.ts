import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { z } from 'zod';

import { QUEUES } from '../platform/queue/queues';
import { DAY_MS, JOB_POLL_INTERVAL_MS } from '../platform/time';
import { type automationTriggerEvent, triggerFor } from './automation-entry.service';
import { START_AUTOMATION_RUN } from './jobs/start-automation-run.job';

@Injectable()
export class AutomationTriggerQueue {
  constructor(@InjectQueue(QUEUES.transactional) private readonly queue: Queue) {}

  async enqueue(event: z.infer<typeof automationTriggerEvent>): Promise<void> {
    if (!triggerFor(event)) return;
    // Keep entry jobs out of the queue that wakes existing runs.
    await this.queue.add(START_AUTOMATION_RUN, event, {
      jobId: `${START_AUTOMATION_RUN}-${event.id}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: JOB_POLL_INTERVAL_MS },
      removeOnComplete: { age: DAY_MS / 1000 },
      removeOnFail: 100,
    });
  }
}
