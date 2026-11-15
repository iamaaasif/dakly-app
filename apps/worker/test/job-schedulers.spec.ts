import 'reflect-metadata';
import type { Queue } from 'bullmq';
import { describe, expect, it } from 'vitest';

import { JobSchedulers } from '../src/job-schedulers';

function recordingQueue() {
  const schedulers: unknown[][] = [];
  const queue = {
    upsertJobScheduler: async (...args: unknown[]) => {
      schedulers.push(args);
    },
  } as unknown as Queue;
  return { queue, schedulers };
}

const scheduler = (name: string) => [
  name,
  { every: 30000 },
  {
    name,
    data: {},
    opts: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  },
];

describe('Worker job schedulers', () => {
  it('registers each scheduled job on its queue every 30 seconds under a fixed id', async () => {
    const transactional = recordingQueue();
    const bulk = recordingQueue();
    const schedulers = new JobSchedulers(transactional.queue, bulk.queue);
    await schedulers.onApplicationBootstrap();
    await schedulers.onApplicationBootstrap();
    const sweeps = [scheduler('send-due-security-notices'), scheduler('staff-alert-relay')];
    expect(transactional.schedulers).toEqual([...sweeps, ...sweeps]);
    expect(bulk.schedulers).toEqual([
      scheduler('staff-audit-maintenance'),
      scheduler('staff-audit-maintenance'),
    ]);
  });
});
