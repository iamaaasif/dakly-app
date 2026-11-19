import type { Queue } from 'bullmq';

import { JOB_POLL_INTERVAL_MS } from '../time';

// The job name is the fixed scheduler id, so every worker upserts the same scheduler and BullMQ
// creates one job per interval, which only one worker can take.
export function scheduleJob(
  queue: Queue,
  name: string,
  schedule: number | { pattern: string; tz: string } = JOB_POLL_INTERVAL_MS,
) {
  return queue.upsertJobScheduler(
    name,
    typeof schedule === 'number' ? { every: schedule } : schedule,
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
