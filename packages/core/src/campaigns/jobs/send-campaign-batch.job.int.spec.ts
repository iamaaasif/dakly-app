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

describe('Campaign batch dispatch (Valkey)', () => {
  it('keeps the same delayed job and lets another store finish its batches', async () => {
    const deferred = { storeId: randomUUID(), campaignId: randomUUID() };
    const chained = { storeId: randomUUID(), campaignId: randomUUID() };
    let chainCalls = 0;
    const sendBatch = vi.fn(async (storeId: string) => {
      if (storeId === deferred.storeId) return new Date(Date.now() + 60_000);
      return ++chainCalls < 3 ? new Date() : null;
    });
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
});
