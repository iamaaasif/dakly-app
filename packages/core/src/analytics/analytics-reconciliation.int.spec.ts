import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { AnalyticsRepairModule } from './analytics-repair.module';
import { QueueLifecycleSnapshot } from './jobs/queue-lifecycle-snapshot.job';
import { ReconcileAnalyticsJob } from './jobs/reconcile-analytics.job';

class TestModule {}
Module({
  imports: [
    DatabaseModule,
    AnalyticsRepairModule,
    BullModule.forRootAsync({
      useFactory: () => {
        const env = loadEnv();
        return { connection: toRedisConnection(env.REDIS_URL), prefix: env.QUEUE_PREFIX };
      },
    }),
  ],
})(TestModule);

describe('Lifecycle summaries', () => {
  const fixture = new OwnerIsolationFixture();
  const now = new Date('2026-11-19T06:00:25Z');
  let app: INestApplicationContext;

  beforeAll(async () => {
    await fixture.setup();
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    vi.spyOn(app.get(Clock), 'now').mockReturnValue(now);
  });

  afterAll(async () => {
    await app?.close();
    await fixture.connection.pool.query(
      'delete from store_daily_metrics where store_id=any($1::uuid[])',
      [[fixture.a, fixture.b]],
    );
    await fixture.close();
  });

  it('refreshes the store once after the last change in a minute', async () => {
    const contactId = randomUUID();
    await fixture.connection.pool.query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'সুমন','manual','customer')",
      [contactId, fixture.a],
    );
    await fixture.connection.pool.query(
      "insert into contact_stats(contact_id,store_id,lifecycle_stage) values($1,$2,'new')",
      [contactId, fixture.a],
    );
    const handler = app.get(QueueLifecycleSnapshot);
    const event = {
      type: 'contact.lifecycle_changed',
      storeId: fixture.a,
      occurredAt: now.toISOString(),
      payload: { contactId },
    };
    await handler.handle({ ...event, id: randomUUID() });
    await fixture.connection.pool.query(
      "update contact_stats set lifecycle_stage='regulars' where contact_id=$1",
      [contactId],
    );
    await handler.handle({ ...event, id: randomUUID() });
    const queue = app.get<Queue>(getQueueToken(QUEUES.sync));
    const jobs = await queue.getDelayed();
    expect(jobs.map(({ data, opts }) => ({ storeId: data.storeId, delay: opts.delay }))).toEqual([
      { storeId: fixture.a, delay: 35000 },
    ]);
    await app.get(ReconcileAnalyticsJob).handle(jobs[0]?.data);
    const { rows } = await fixture.connection.pool.query(
      "select dimension, value from store_daily_metrics where store_id=$1 and day='2026-11-19' and metric='lifecycle' and value<>0",
      [fixture.a],
    );
    expect(rows).toEqual([{ dimension: 'regulars', value: '1' }]);
  });

  it('removes only expired event markers for the store', async () => {
    await fixture.connection.pool.query(
      `insert into store_daily_metrics(store_id,day,metric,dimension,value) values
        ($1,'2026-11-11','order_event',$3,1),($1,'2026-11-12','order_event',$4,1),
        ($1,'2026-11-11','orders','',8),($2,'2026-11-11','order_event',$3,1)`,
      [fixture.a, fixture.b, randomUUID(), randomUUID()],
    );
    await app.get(ReconcileAnalyticsJob).handle({
      storeId: fixture.a,
      day: '2026-11-19',
      page: { kind: 'markers', batch: 0 },
    });
    const { rows } = await fixture.connection.pool.query(
      `select metric, day::text from store_daily_metrics
       where store_id=$1 and day<'2026-11-19' order by day`,
      [fixture.a],
    );
    expect(rows).toEqual([
      { metric: 'orders', day: '2026-11-11' },
      { metric: 'order_event', day: '2026-11-12' },
    ]);
    expect(
      await fixture.connection.pool.query(
        "select 1 from store_daily_metrics where store_id=$1 and metric='order_event'",
        [fixture.b],
      ),
    ).toMatchObject({ rowCount: 1 });
  });
});
