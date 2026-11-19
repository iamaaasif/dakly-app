import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Queue } from 'bullmq';
import { afterAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { DAY_MS, MINUTE_MS } from '../platform/time';
import { MetaWebhooksRepository } from './meta-webhooks.repository';
import { MetaWebhooksService } from './meta-webhooks.service';

const now = new Date('2026-11-19T09:00:00Z');
const clock = { now: () => now };
const queue = new Queue<{ webhookEventId: string }>(QUEUES.inbound, {
  connection: toRedisConnection(process.env.REDIS_URL!),
  prefix: `${process.env.QUEUE_PREFIX}-webhook-maintenance`,
});
const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const app = createDatabase(process.env.DATABASE_URL!);
const repository = new MetaWebhooksRepository(app.db);
const service = new MetaWebhooksService(repository, clock, queue);
const deliveryIds: string[] = [];

async function saveDelivery(status: string, age: number) {
  const id = randomUUID();
  deliveryIds.push(id);
  await admin.pool.query(
    `insert into webhook_events (id, provider, external_id, status, received_at, payload)
     values ($1, 'meta', $2, $3, $4, '{"object":"page","entry":[]}')`,
    [id, id, status, new Date(now.getTime() - age)],
  );
  return id;
}

describe('Meta webhook maintenance', () => {
  afterAll(async () => {
    try {
      await admin.pool.query('delete from webhook_events where id = any($1::uuid[])', [
        deliveryIds,
      ]);
    } finally {
      await Promise.all([queue.close(), app.pool.end(), admin.pool.end()]);
    }
  });

  it('restores a lost job once when two recovery runs overlap', async () => {
    const lost = await saveDelivery('received', 2 * MINUTE_MS);
    const waiting = await saveDelivery('received', 2 * MINUTE_MS);
    const processed = await saveDelivery('processed', 2 * MINUTE_MS);
    const recent = await saveDelivery('received', MINUTE_MS / 2);
    await queue.add(
      'process-webhook-event',
      { webhookEventId: waiting },
      {
        jobId: waiting,
        delay: MINUTE_MS,
      },
    );

    await Promise.all([service.recoverDeliveries(), service.recoverDeliveries()]);
    await service.recoverDeliveries();

    const restored = await queue.getJob(lost);
    expect(restored).toMatchObject({
      name: 'process-webhook-event',
      data: { webhookEventId: lost },
      opts: { jobId: lost, attempts: 3 },
    });
    expect((await queue.getJobs(['waiting'])).map((job) => job.id)).toEqual([lost]);
    expect(await queue.getJobState(waiting)).toBe('delayed');
    expect(await queue.getJob(processed)).toBeUndefined();
    expect(await queue.getJob(recent)).toBeUndefined();
  });

  it('purges only finished rows older than seven days even when two runs overlap', async () => {
    const oldProcessed = await saveDelivery('processed', 7 * DAY_MS + 1);
    const oldIgnored = await saveDelivery('ignored', 8 * DAY_MS);
    const oldWaiting = await saveDelivery('received', 8 * DAY_MS);
    const boundary = await saveDelivery('processed', 7 * DAY_MS);
    const recent = await saveDelivery('processed', 6 * DAY_MS);

    await Promise.all([service.purgeDeliveries(), service.purgeDeliveries()]);

    const result = await admin.pool.query<{ id: string }>(
      'select id from webhook_events where id = any($1::uuid[])',
      [[oldProcessed, oldIgnored, oldWaiting, boundary, recent]],
    );
    expect(result.rows.map(({ id }) => id).sort()).toEqual([oldWaiting, boundary, recent].sort());
    expect(await repository.findReceived(oldWaiting)).toMatchObject({
      payload: { object: 'page', entry: [] },
    });
  });
});
