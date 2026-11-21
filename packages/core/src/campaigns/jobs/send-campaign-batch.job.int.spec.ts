import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DiscoveryModule, NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import { KillSwitchesService } from '../../kill-switches/kill-switches.service';
import { loadEnv } from '../../platform/config/env';
import { ErrorReporter } from '../../platform/logging/error-reporter';
import { CampaignJobDispatcher } from '../../platform/queue/job-dispatcher';
import { QUEUES } from '../../platform/queue/queues';
import { toRedisConnection } from '../../platform/queue/redis-connection';
import { CampaignBatchService } from '../campaign-batch.service';
import { SEND_CAMPAIGN_BATCH, SendCampaignBatchJob } from './send-campaign-batch.job';

async function openQueue(
  sendStoreBatch: CampaignBatchService['sendStoreBatch'],
  namespace = randomUUID(),
) {
  const env = loadEnv();
  class TestModule {}
  Module({
    imports: [
      DiscoveryModule,
      BullModule.forRoot({
        connection: toRedisConnection(env.REDIS_URL),
        prefix: `${env.QUEUE_PREFIX}-${namespace}`,
      }),
      BullModule.registerQueue({ name: QUEUES.campaign }),
    ],
    providers: [
      CampaignJobDispatcher,
      SendCampaignBatchJob,
      { provide: CampaignBatchService, useValue: { sendStoreBatch } },
      { provide: KillSwitchesService, useValue: { deferIfPaused: async () => undefined } },
      { provide: ErrorReporter, useValue: new ErrorReporter(undefined) },
    ],
  })(TestModule);
  const app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  const queue = app.get<Queue>(getQueueToken(QUEUES.campaign));
  return { app, queue };
}

describe('Campaign batch dispatch (Valkey)', () => {
  it('keeps the same delayed job and lets another store finish its batches', async () => {
    const deferred = randomUUID();
    const chained = randomUUID();
    let chainCalls = 0;
    const sendStoreBatch = vi.fn(async (storeId: string) => {
      if (storeId === deferred) return { delayUntil: Date.now() + 60_000 };
      if (++chainCalls < 3) return { delayUntil: Date.now() };
    });
    const { app, queue } = await openQueue(sendStoreBatch);
    try {
      const opts = { deduplication: { id: deferred } };
      const first = await queue.add(SEND_CAMPAIGN_BATCH, { storeId: deferred }, opts);
      await vi.waitFor(async () => expect(await first.getState()).toBe('delayed'));

      await queue.add(SEND_CAMPAIGN_BATCH, { storeId: deferred }, opts);
      expect(await queue.getDeduplicationJobId(deferred)).toBe(first.id);
      expect((await queue.getJobs(['delayed'])).map(({ id }) => id)).toEqual([first.id]);

      const other = await queue.add(
        SEND_CAMPAIGN_BATCH,
        { storeId: chained },
        { deduplication: { id: chained } },
      );
      await vi.waitFor(async () => expect(await other.getState()).toBe('completed'));
      expect(sendStoreBatch.mock.calls).toEqual([[deferred], [chained], [chained], [chained]]);
      expect(await first.getState()).toBe('delayed');
    } finally {
      try {
        await queue.obliterate({ force: true });
      } finally {
        await app.close();
      }
    }
  });

  it('deduplicates a running store across workers while another store can finish', async () => {
    const active = randomUUID();
    const other = randomUUID();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const sendStoreBatch = vi.fn(async (storeId: string) => {
      if (storeId !== active) return;
      entered.resolve();
      await release.promise;
    });
    const namespace = randomUUID();
    const firstWorker = await openQueue(sendStoreBatch, namespace);
    const secondWorker = await openQueue(sendStoreBatch, namespace);
    const { queue } = firstWorker;
    try {
      const opts = { deduplication: { id: active } };
      const first = await queue.add(SEND_CAMPAIGN_BATCH, { storeId: active }, opts);
      await entered.promise;
      await secondWorker.queue.add(SEND_CAMPAIGN_BATCH, { storeId: active }, opts);
      expect(await queue.getDeduplicationJobId(active)).toBe(first.id);
      const second = await queue.add(
        SEND_CAMPAIGN_BATCH,
        { storeId: other },
        { deduplication: { id: other } },
      );
      await vi.waitFor(async () => expect(await second.getState()).toBe('completed'));
      expect(await first.getState()).toBe('active');
      expect(sendStoreBatch.mock.calls).toEqual([[active], [other]]);
      release.resolve();
      await vi.waitFor(async () => expect(await first.getState()).toBe('completed'));
      expect(await queue.getDeduplicationJobId(active)).toBeNull();
    } finally {
      release.resolve();
      try {
        await queue.obliterate({ force: true });
      } finally {
        await Promise.all([firstWorker.app.close(), secondWorker.app.close()]);
      }
    }
  });

  it('retains the same deduplication key through a failed retry and releases it on completion', async () => {
    const storeId = randomUUID();
    const sendStoreBatch = vi
      .fn<CampaignBatchService['sendStoreBatch']>()
      .mockRejectedValueOnce(new Error('Transient failure'))
      .mockResolvedValue(undefined);
    const { app, queue } = await openQueue(sendStoreBatch);
    try {
      const opts = { deduplication: { id: storeId }, attempts: 2, backoff: 750 };
      const first = await queue.add(SEND_CAMPAIGN_BATCH, { storeId }, opts);
      await vi.waitFor(async () => expect(await first.getState()).toBe('delayed'));
      expect(await queue.getDeduplicationJobId(storeId)).toBe(first.id);
      await queue.add(SEND_CAMPAIGN_BATCH, { storeId }, opts);
      await vi.waitFor(async () => expect(await first.getState()).toBe('completed'), {
        timeout: 2_000,
      });
      expect(sendStoreBatch.mock.calls).toEqual([[storeId], [storeId]]);
      expect(await queue.getDeduplicationJobId(storeId)).toBeNull();
    } finally {
      try {
        await queue.obliterate({ force: true });
      } finally {
        await app.close();
      }
    }
  });
});
