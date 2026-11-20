import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DiscoveryModule, NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import { loadEnv } from '../../platform/config/env';
import { ErrorReporter } from '../../platform/logging/error-reporter';
import { CampaignJobDispatcher } from '../../platform/queue/job-dispatcher';
import { QUEUES } from '../../platform/queue/queues';
import { toRedisConnection } from '../../platform/queue/redis-connection';
import { CampaignSenderService } from '../campaign-sender.service';
import { SEND_CAMPAIGN_BATCH, SendCampaignBatchJob } from './send-campaign-batch.job';

async function openQueue(sendBatch: CampaignSenderService['sendBatch']) {
  const env = loadEnv();
  class TestModule {}
  Module({
    imports: [
      DiscoveryModule,
      BullModule.forRoot({
        connection: toRedisConnection(env.REDIS_URL),
        prefix: `${env.QUEUE_PREFIX}-${randomUUID()}`,
      }),
      BullModule.registerQueue({ name: QUEUES.campaign }),
    ],
    providers: [
      CampaignJobDispatcher,
      SendCampaignBatchJob,
      { provide: CampaignSenderService, useValue: { sendBatch } },
      { provide: ErrorReporter, useValue: new ErrorReporter(undefined) },
    ],
  })(TestModule);
  const app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  const queue = app.get<Queue>(getQueueToken(QUEUES.campaign));
  return { app, queue, handler: app.get(SendCampaignBatchJob) };
}

describe('Campaign batch dispatch (Valkey)', () => {
  it('keeps the same delayed job and lets another store finish its batches', async () => {
    const deferred = { storeId: randomUUID(), campaignId: randomUUID() };
    const chained = { storeId: randomUUID(), campaignId: randomUUID() };
    let chainCalls = 0;
    const sendBatch = vi.fn(async (storeId: string) => {
      if (storeId === deferred.storeId) return new Date(Date.now() + 60_000);
      return ++chainCalls < 3 ? new Date() : null;
    });
    const { app, queue } = await openQueue(sendBatch);
    try {
      const opts = { deduplication: { id: deferred.storeId } };
      const first = await queue.add(SEND_CAMPAIGN_BATCH, deferred, opts);
      await vi.waitFor(async () => expect(await first.getState()).toBe('delayed'));

      await queue.add(SEND_CAMPAIGN_BATCH, deferred, opts);
      expect(await queue.getDeduplicationJobId(deferred.storeId)).toBe(first.id);
      expect((await queue.getJobs(['delayed'])).map(({ id }) => id)).toEqual([first.id]);

      const other = await queue.add(SEND_CAMPAIGN_BATCH, chained, {
        deduplication: { id: chained.storeId },
      });
      await vi.waitFor(async () => expect(await other.getState()).toBe('completed'));
      expect(sendBatch.mock.calls).toEqual([
        [deferred.storeId, deferred.campaignId],
        [chained.storeId, chained.campaignId],
        [chained.storeId, chained.campaignId],
        [chained.storeId, chained.campaignId],
      ]);
      expect(await first.getState()).toBe('delayed');
    } finally {
      try {
        await queue.obliterate({ force: true });
      } finally {
        await app.close();
      }
    }
  });

  it('runs one batch per store while other stores continue', async () => {
    const active = { storeId: randomUUID(), campaignId: randomUUID() };
    const recovery = { storeId: active.storeId, campaignId: randomUUID() };
    const other = { storeId: randomUUID(), campaignId: randomUUID() };
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<Date>();
    const sendBatch = vi.fn(async (_storeId: string, campaignId: string) => {
      if (campaignId !== active.campaignId) return null;
      entered.resolve();
      return release.promise;
    });
    const { app, handler } = await openQueue(sendBatch);
    const first = handler.handle(active);
    try {
      await Promise.race([
        entered.promise,
        first.then(() => {
          throw new Error('The active campaign ended before entering its batch');
        }),
      ]);
      const sameStore = await handler.handle(recovery);
      expect(sameStore?.delayUntil).toBeGreaterThan(Date.now());
      expect(await handler.handle(other)).toBeUndefined();
      expect(sendBatch.mock.calls).toEqual([
        [active.storeId, active.campaignId],
        [other.storeId, other.campaignId],
      ]);

      const quietHoursEnd = new Date(Date.now() + 60_000);
      release.resolve(quietHoursEnd);
      expect(await first).toEqual({ delayUntil: quietHoursEnd.getTime() });
      expect(await handler.handle(recovery)).toBeUndefined();
      expect(sendBatch).toHaveBeenLastCalledWith(recovery.storeId, recovery.campaignId);
    } finally {
      release.resolve(new Date());
      await first.catch(() => undefined);
      await app.close();
    }
  });
});
