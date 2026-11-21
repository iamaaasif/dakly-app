import 'reflect-metadata';
import type { Queue } from 'bullmq';
import { describe, expect, it } from 'vitest';

import { SocialPublishingModule } from '@dakly/core/social/social-publishing.module';

import { JobSchedulers } from '../src/job-schedulers';
import { WorkerModule } from '../src/worker.module';

function recordingQueue() {
  const schedulers: unknown[][] = [];
  const queue = {
    getJobScheduler: async (name: string) => schedulers.findLast(([id]) => id === name)?.[1],
    upsertJobScheduler: async (...args: unknown[]) => {
      schedulers.push(args);
    },
  } as unknown as Queue;
  return { queue, schedulers };
}

const scheduler = (name: string, schedule: number | { pattern: string; tz: string } = 30000) => [
  name,
  typeof schedule === 'number' ? { every: schedule } : schedule,
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
  it('registers social publishing jobs only when Meta is configured', () => {
    expect(WorkerModule.register(undefined).imports).toEqual([]);
    expect(WorkerModule.register('fake').imports).toEqual([
      expect.objectContaining({ module: SocialPublishingModule }),
    ]);
  });

  it('registers post recovery every minute and the metrics sweep every hour under fixed ids', async () => {
    const sync = recordingQueue();
    const publishing = new SocialPublishingModule(sync.queue);
    await publishing.onApplicationBootstrap();
    await publishing.onApplicationBootstrap();
    expect(sync.schedulers).toEqual([
      scheduler('recover-post-targets', 60000),
      scheduler('queue-post-metrics-refreshes', 3600000),
      scheduler('recover-post-targets', 60000),
      scheduler('queue-post-metrics-refreshes', 3600000),
    ]);
  });

  it('registers each scheduled job on its queue at its interval under a fixed id', async () => {
    const transactional = recordingQueue();
    const bulk = recordingQueue();
    const sync = recordingQueue();
    const payments = recordingQueue();
    const workflow = recordingQueue();
    const campaign = recordingQueue();
    const schedulers = new JobSchedulers(
      transactional.queue,
      bulk.queue,
      sync.queue,
      payments.queue,
      workflow.queue,
      campaign.queue,
    );
    await schedulers.onApplicationBootstrap();
    await schedulers.onApplicationBootstrap();
    const sweeps = [
      scheduler('send-due-security-notices'),
      scheduler('staff-alert-relay'),
      scheduler('relay-outbox', 1000),
      scheduler('wake-snoozed-notifications'),
      scheduler('recover-webhook-events', 60000),
    ];
    expect(transactional.schedulers).toEqual([...sweeps, ...sweeps]);
    const bulkIntervals = [
      scheduler('staff-audit-maintenance'),
      scheduler('check-ai-cost-ceiling', 900000),
      scheduler('fail-stuck-imports'),
    ];
    expect(bulk.schedulers).toEqual([
      ...bulkIntervals,
      scheduler('sweep-contact-stats', { pattern: '0 0 * * *', tz: 'UTC' }),
      scheduler('sweep-automation-birthdays', { pattern: '0 * * * *', tz: 'UTC' }),
      scheduler('sweep-analytics', { pattern: '0 0 * * *', tz: 'UTC' }),
      scheduler('purge-webhook-events', { pattern: '0 0 * * *', tz: 'UTC' }),
      scheduler('run-golden-eval', { pattern: '0 20 * * *', tz: 'UTC' }),
      scheduler('run-maintenance', { pattern: '0 19 * * *', tz: 'UTC' }),
      ...bulkIntervals,
    ]);
    expect(sync.schedulers).toEqual([
      scheduler('queue-channel-token-checks', 86400000),
      scheduler('reconcile-meta-page-subscriptions', 86400000),
      scheduler('queue-conversation-returns', 60000),
      scheduler('queue-channel-token-checks', 86400000),
      scheduler('reconcile-meta-page-subscriptions', 86400000),
      scheduler('queue-conversation-returns', 60000),
    ]);
    expect(payments.schedulers).toEqual([
      scheduler('recover-payment-callbacks', 60000),
      scheduler('sweep-payment-checks'),
      scheduler('sweep-payment-settlements', { pattern: '0 0 * * *', tz: 'Asia/Dhaka' }),
      scheduler('recover-payment-callbacks', 60000),
      scheduler('sweep-payment-checks'),
    ]);
    expect(workflow.schedulers).toEqual([
      scheduler('wake-due-runs', 60000),
      scheduler('wake-due-runs', 60000),
    ]);
    expect(campaign.schedulers).toEqual([
      scheduler('start-due-campaigns', 60000),
      scheduler('start-due-campaigns', 60000),
    ]);
  });
});
