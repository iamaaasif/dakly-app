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

const scheduler = (name: string, every = 30000) => [
  name,
  { every },
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
  it('registers each scheduled job on its queue at its interval under a fixed id', async () => {
    const transactional = recordingQueue();
    const bulk = recordingQueue();
    const sync = recordingQueue();
    const workflow = recordingQueue();
    const schedulers = new JobSchedulers(
      transactional.queue,
      bulk.queue,
      sync.queue,
      workflow.queue,
    );
    await schedulers.onApplicationBootstrap();
    await schedulers.onApplicationBootstrap();
    const sweeps = [
      scheduler('send-due-security-notices'),
      scheduler('staff-alert-relay'),
      scheduler('relay-outbox', 1000),
      scheduler('wake-snoozed-notifications'),
    ];
    expect(transactional.schedulers).toEqual([...sweeps, ...sweeps]);
    const bulkSweeps = [scheduler('staff-audit-maintenance'), scheduler('fail-stuck-imports')];
    expect(bulk.schedulers).toEqual([...bulkSweeps, ...bulkSweeps]);
    expect(sync.schedulers).toEqual([
      scheduler('queue-channel-token-checks', 86400000),
      scheduler('queue-conversation-returns', 60000),
      scheduler('queue-channel-token-checks', 86400000),
      scheduler('queue-conversation-returns', 60000),
    ]);
    expect(workflow.schedulers).toEqual([
      scheduler('wake-due-runs', 60000),
      scheduler('wake-due-runs', 60000),
    ]);
  });
});
