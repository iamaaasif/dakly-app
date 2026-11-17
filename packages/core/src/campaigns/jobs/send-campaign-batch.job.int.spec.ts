import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { type INestApplicationContext, Module } from '@nestjs/common';
import { DiscoveryModule, NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock } from '../../platform/clock';
import { loadEnv } from '../../platform/config/env';
import { ErrorReporter } from '../../platform/logging/error-reporter';
import { CampaignJobDispatcher } from '../../platform/queue/job-dispatcher';
import { QUEUES } from '../../platform/queue/queues';
import { toRedisConnection } from '../../platform/queue/redis-connection';
import { CampaignSenderService } from '../campaign-sender.service';
import { SendCampaignBatchJob } from './send-campaign-batch.job';
import { StartDueCampaignsJob } from './start-due-campaigns.job';

// One store's campaign is deferred to the end of quiet hours; another store's sends three
// batches and finishes.
const [deferredStore, chainedStore] = [randomUUID(), randomUUID()];
const deferred = randomUUID();
const chained = randomUUID();
const batches: string[] = [];
const sender = {
  startDue: async () => [
    { storeId: deferredStore, campaignId: deferred },
    { storeId: chainedStore, campaignId: chained },
  ],
  sendBatch: async (_storeId: string, campaignId: string) => {
    batches.push(campaignId);
    if (campaignId === deferred) return new Date(Date.now() + 60 * 60 * 1000);
    return batches.filter((id) => id === chained).length < 3 ? new Date() : null;
  },
};
let app: INestApplicationContext;
let queue: Queue;

async function until(condition: () => boolean | Promise<boolean>) {
  for (let attempt = 0; attempt < 200 && !(await condition()); attempt += 1) await setTimeout(25);
  expect(await condition()).toBe(true);
}

describe('Campaign batch jobs (Valkey)', () => {
  beforeAll(async () => {
    class TestModule {}
    Module({
      imports: [
        DiscoveryModule,
        BullModule.forRoot({
          connection: toRedisConnection(loadEnv().REDIS_URL),
          prefix: `${loadEnv().QUEUE_PREFIX}-${randomUUID()}`,
        }),
        BullModule.registerQueue({ name: QUEUES.campaign }),
      ],
      providers: [
        CampaignJobDispatcher,
        SendCampaignBatchJob,
        StartDueCampaignsJob,
        { provide: CampaignSenderService, useValue: sender },
        { provide: Clock, useValue: { now: () => new Date() } },
        { provide: ErrorReporter, useValue: new ErrorReporter(undefined) },
      ],
    })(TestModule);
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    queue = app.get<Queue>(getQueueToken(QUEUES.campaign));
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await app.close();
  });

  it('keeps one chain of batches per store across sweep ticks', async () => {
    const sweep = app.get(StartDueCampaignsJob);
    for (let tick = 0; tick < 3; tick += 1) await sweep.handle({});
    await until(() => batches.filter((id) => id === chained).length >= 3);
    await until(() => batches.includes(deferred));
    // A tick that lands while a batch frees its key and queues the next takes the key itself, so
    // the first ticks may run the deferred batch again; once it is delayed, no tick adds one.
    await until(async () => (await queue.getDelayedCount()) === 1);
    const deferredRuns = batches.filter((id) => id === deferred).length;
    for (let tick = 0; tick < 3; tick += 1) {
      await sweep.handle({});
      await setTimeout(100);
    }

    expect(batches.filter((id) => id === deferred)).toHaveLength(deferredRuns);
    const open = await queue.getJobs(['waiting', 'active', 'delayed', 'prioritized']);
    const perStore = new Map<string, number>();
    for (const job of open)
      perStore.set(job.data.storeId, (perStore.get(job.data.storeId) ?? 0) + 1);
    expect(perStore.get(deferredStore)).toBe(1);
    expect(perStore.get(chainedStore) ?? 0).toBeLessThanOrEqual(1);
  });
});
