import type { Queue } from 'bullmq';

import { JOB_POLL_INTERVAL_MS } from '../time';

// The job name is the fixed scheduler id, so every worker upserts the same scheduler and BullMQ
// creates one job per interval, which only one worker can take.
export function scheduleJob(queue: Queue, name: string, every = JOB_POLL_INTERVAL_MS) {
  return queue.upsertJobScheduler(
    name,
    { every },
    {
      name,
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: JOB_POLL_INTERVAL_MS },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    },
  );
}
