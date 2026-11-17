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

const storeId = randomUUID();
// One campaign deferred to the end of quiet hours, one that sends three batches and finishes.
const deferred = randomUUID();
const chained = randomUUID();
const batches: string[] = [];
const sender = {
  startDue: async () => [
    { storeId, campaignId: deferred },
    { storeId, campaignId: chained },
  ],
  sendBatch: async (_storeId: string, campaignId: string) => {
    batches.push(campaignId);
    if (campaignId === deferred) return new Date(Date.now() + 60 * 60 * 1000);
    return batches.filter((id) => id === chained).length < 3 ? new Date() : null;
  },
};
let app: INestApplicationContext;
let queue: Queue;

async function until(condition: () => boolean) {
  for (let attempt = 0; attempt < 200 && !condition(); attempt += 1) await setTimeout(25);
  expect(condition()).toBe(true);
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

  it('keeps one chain of batches per campaign across sweep ticks', async () => {
    const sweep = app.get(StartDueCampaignsJob);
    for (let tick = 0; tick < 3; tick += 1) await sweep.handle({});
    await until(() => batches.filter((id) => id === chained).length >= 3);
    await until(() => batches.includes(deferred));
    for (let tick = 0; tick < 3; tick += 1) {
      await sweep.handle({});
      await setTimeout(100);
    }

    // The deferred batch holds its campaign's key, so no sweep tick starts a second chain.
    expect(batches.filter((id) => id === deferred)).toHaveLength(1);
    const open = await queue.getJobs(['waiting', 'active', 'delayed', 'prioritized']);
    const perCampaign = new Map<string, number>();
    for (const job of open)
      perCampaign.set(job.data.campaignId, (perCampaign.get(job.data.campaignId) ?? 0) + 1);
    expect(perCampaign.get(deferred)).toBe(1);
    expect(perCampaign.get(chained) ?? 0).toBeLessThanOrEqual(1);
  });
});
