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
import { JOB_POLL_INTERVAL_MS, MINUTE_MS } from '../../platform/time';
import { CampaignSenderService } from '../campaign-sender.service';
import { CampaignSweepService } from '../campaign-sweep.service';
import { SEND_CAMPAIGN_BATCH, SendCampaignBatchJob } from './send-campaign-batch.job';

async function openQueue(
  sendBatch: CampaignSenderService['sendBatch'],
  nextForLane: CampaignSweepService['nextForLane'],
) {
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
      { provide: CampaignSweepService, useValue: { nextForLane } },
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
    const { app, queue } = await openQueue(sendBatch, async (storeId) =>
      storeId === deferred.storeId ? deferred.campaignId : chained.campaignId,
    );
    try {
      const opts = { deduplication: { id: deferred.storeId } };
      const first = await queue.add(
        SEND_CAMPAIGN_BATCH,
        { storeId: deferred.storeId, lane: 'sending' },
        opts,
      );
      await vi.waitFor(async () => expect(await first.getState()).toBe('delayed'));

      await queue.add(SEND_CAMPAIGN_BATCH, { storeId: deferred.storeId, lane: 'sending' }, opts);
      expect(await queue.getDeduplicationJobId(deferred.storeId)).toBe(first.id);
      expect((await queue.getJobs(['delayed'])).map(({ id }) => id)).toEqual([first.id]);

      const other = await queue.add(
        SEND_CAMPAIGN_BATCH,
        { storeId: chained.storeId, lane: 'sending' },
        {
          deduplication: { id: chained.storeId },
        },
      );
      await vi.waitFor(async () => expect(await other.getState()).toBe('completed'));
      expect(sendBatch.mock.calls).toEqual([
        [deferred.storeId, deferred.campaignId, expect.any(Function)],
        [chained.storeId, chained.campaignId, expect.any(Function)],
        [chained.storeId, chained.campaignId, expect.any(Function)],
        [chained.storeId, chained.campaignId, expect.any(Function)],
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
    const { app, handler } = await openQueue(sendBatch, async (storeId, lane) => {
      if (storeId === other.storeId) return other.campaignId;
      return lane === 'sending' ? active.campaignId : recovery.campaignId;
    });
    const first = handler.handle({ storeId: active.storeId, lane: 'sending' });
    try {
      await Promise.race([
        entered.promise,
        first.then(() => {
          throw new Error('The active campaign ended before entering its batch');
        }),
      ]);
      const sameStore = await handler.handle({ storeId: recovery.storeId, lane: 'cancelled' });
      expect(sameStore?.delayUntil).toBeGreaterThan(Date.now());
      expect(await handler.handle({ storeId: other.storeId, lane: 'sending' })).toBeUndefined();
      expect(sendBatch.mock.calls).toEqual([
        [active.storeId, active.campaignId, expect.any(Function)],
        [other.storeId, other.campaignId, expect.any(Function)],
      ]);

      const quietHoursEnd = new Date(Date.now() + 60_000);
      release.resolve(quietHoursEnd);
      expect(await first).toEqual({ delayUntil: quietHoursEnd.getTime() });
      expect(
        await handler.handle({ storeId: recovery.storeId, lane: 'cancelled' }),
      ).toBeUndefined();
      expect(sendBatch).toHaveBeenLastCalledWith(
        recovery.storeId,
        recovery.campaignId,
        expect.any(Function),
      );
    } finally {
      release.resolve(new Date());
      await first.catch(() => undefined);
      await app.close();
    }
  });

  it('renews the lease while working and fences a batch that loses it', async () => {
    const payload = { storeId: randomUUID(), lane: 'sending' };
    const entered = Promise.withResolvers<() => boolean>();
    const finish = Promise.withResolvers<null>();
    const { app, queue, handler } = await openQueue(
      async (_storeId, _campaignId, hasLease) => {
        entered.resolve(hasLease!);
        return finish.promise;
      },
      async () => randomUUID(),
    );
    const client = await queue.client;
    const key = queue.toKey(`batch-lease:${payload.storeId}`);
    client.defineCommand('campaignBatchLeaseTtl', {
      numberOfKeys: 1,
      lua: "return redis.call('PTTL', KEYS[1])",
    });
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const batch = handler.handle(payload);
    try {
      const hasLease = await Promise.race([
        entered.promise,
        batch.then(() => {
          throw new Error('The batch ended before taking its lease');
        }),
      ]);
      const token = await client.get(key);
      expect(token).toBeTruthy();
      expect(hasLease()).toBe(true);
      await client.set(key, token!, { PX: MINUTE_MS });
      await vi.advanceTimersByTimeAsync(JOB_POLL_INTERVAL_MS);
      await vi.waitFor(async () => {
        expect(await client.runCommand('campaignBatchLeaseTtl', [key])).toBeGreaterThan(MINUTE_MS);
      });
      const nearExpiry = performance.now() + 4 * MINUTE_MS + 1000;
      const time = vi.spyOn(performance, 'now').mockReturnValue(nearExpiry);
      try {
        expect(hasLease()).toBe(false);
      } finally {
        time.mockRestore();
      }

      await client.set(key, 'other-worker', { PX: MINUTE_MS });
      await vi.advanceTimersByTimeAsync(JOB_POLL_INTERVAL_MS);
      await vi.waitFor(() => expect(hasLease()).toBe(false));
      finish.resolve(null);
      await batch;
      expect(await client.get(key)).toBe('other-worker');
    } finally {
      finish.resolve(null);
      await batch.catch(() => undefined);
      vi.useRealTimers();
      await app.close();
    }
  });
});
