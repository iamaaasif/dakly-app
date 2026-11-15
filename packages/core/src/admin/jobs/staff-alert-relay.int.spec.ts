import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Worker, type Queue } from 'bullmq';
import { afterEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../platform/config/env';
import { QUEUES } from '../../platform/queue/queues';
import { toRedisConnection } from '../../platform/queue/redis-connection';
import { StaffAlertsService } from '../staff-alerts.service';
import { STAFF_ALERT_DELIVERY } from './staff-alert-delivery.job';
import { StaffAlertRelayJob } from './staff-alert-relay.job';

const connection = toRedisConnection(loadEnv().REDIS_URL);
let application: INestApplicationContext | undefined;

afterEach(async () => {
  await application?.close();
  application = undefined;
});

async function start(pending: () => Promise<{ id: string }[]>, prefix: string) {
  class TestModule {}
  Module({
    imports: [
      BullModule.forRoot({ connection, prefix }),
      BullModule.registerQueue({ name: QUEUES.transactional }),
    ],
    providers: [StaffAlertRelayJob, { provide: StaffAlertsService, useValue: { pending } }],
  })(TestModule);
  application = await NestFactory.createApplicationContext(TestModule, { logger: false });
  return {
    relay: application.get(StaffAlertRelayJob),
    queue: application.get<Queue>(getQueueToken(QUEUES.transactional)),
  };
}

async function queued(queue: Queue, state: 'waiting' | 'failed') {
  return (await queue.getJobs([state])).map((job) => ({
    name: job.name,
    data: job.data,
    opts: job.opts,
  }));
}

function delivery(auditId: string) {
  return {
    name: STAFF_ALERT_DELIVERY,
    data: { auditId },
    opts: expect.objectContaining({
      deduplication: { id: auditId },
      attempts: 5,
      backoff: { type: 'exponential', delay: 30000 },
      removeOnComplete: true,
      removeOnFail: 100,
    }),
  };
}

describe('Staff alert relay', () => {
  it('queues each pending alert once with bounded retry, deduplicated by audit id', async () => {
    const [first, second] = [randomUUID(), randomUUID()];
    let calls = 0;
    const { relay, queue } = await start(async () => {
      calls++;
      return [{ id: first }, { id: second }];
    }, `test-${randomUUID()}`);
    await relay.handle({});
    await relay.handle({});
    expect(calls).toBe(2);
    expect(await queued(queue, 'waiting')).toEqual(
      expect.arrayContaining([delivery(first), delivery(second)]),
    );
    expect(await queue.getWaitingCount()).toBe(2);
    await expect(relay.handle({ storeId: randomUUID() })).rejects.toThrow();
  });

  it('queues an alert again once its earlier delivery job failed and was kept', async () => {
    const auditId = randomUUID();
    const prefix = `test-${randomUUID()}`;
    const { relay, queue } = await start(async () => [{ id: auditId }], prefix);
    await relay.handle({});
    const worker = new Worker(QUEUES.transactional, null, { connection, prefix, autorun: false });
    try {
      const token = randomUUID();
      const job = (await worker.getNextJob(token))!;
      job.discard();
      await job.moveToFailed(new Error('Staff alert delivery job failed'), token);
    } finally {
      await worker.close();
    }
    expect(await queued(queue, 'failed')).toEqual([delivery(auditId)]);
    await relay.handle({});
    await relay.handle({});
    expect(await queued(queue, 'waiting')).toEqual([delivery(auditId)]);
    expect(await queue.getFailedCount()).toBe(1);
  });
});
