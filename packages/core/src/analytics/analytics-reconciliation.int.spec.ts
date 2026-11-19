import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Worker, type Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { DatabaseModule } from '../platform/database/database.module';
import { QUEUES } from '../platform/queue/queues';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { RECONCILE_ANALYTICS } from './analytics-reconciliation.service';
import { AnalyticsModule } from './analytics.module';
import { ReconcileAnalyticsJob } from './jobs/reconcile-analytics.job';
import { ScheduleLifecycleOnStatsRepaired } from './jobs/schedule-lifecycle-on-stats-repaired.job';
import { SweepAnalyticsJob } from './jobs/sweep-analytics.job';

class TestModule {}
Module({
  imports: [
    DatabaseModule,
    AnalyticsModule,
    BullModule.forRootAsync({
      useFactory: () => {
        const env = loadEnv();
        return {
          connection: toRedisConnection(env.REDIS_URL),
          prefix: `${env.QUEUE_PREFIX}:analytics-${randomUUID()}`,
        };
      },
    }),
  ],
})(TestModule);

describe('Analytics reconciliation', () => {
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
    await fixture.connection.pool.query('delete from orders where store_id=any($1::uuid[])', [
      [fixture.a, fixture.b],
    ]);
    await fixture.close();
  });

  it('writes one store-local snapshot after contact stats are ready', async () => {
    const eligible = randomUUID();
    const blocked = randomUUID();
    const foreign = randomUUID();
    await fixture.connection.pool.query(
      `insert into contacts(id,store_id,name,source,kind,is_blocked) values
       ($1,$4,'সুমন','manual','customer',false),($2,$4,'রিনা','manual','customer',true),
       ($3,$5,'করিম','manual','customer',false)`,
      [eligible, blocked, foreign, fixture.a, fixture.b],
    );
    await fixture.connection.pool.query(
      `insert into contact_stats(contact_id,store_id,lifecycle_stage) values
       ($1,$4,'regulars'),($2,$4,'new'),($3,$5,'regulars')`,
      [eligible, blocked, foreign, fixture.a, fixture.b],
    );
    await app.get(ReconcileAnalyticsJob).handle({
      storeId: fixture.a,
      day: '2026-11-19',
      page: { kind: 'buyers', after: null },
    });
    const snapshot = () =>
      fixture.connection.pool.query(
        "select dimension, value from store_daily_metrics where store_id=$1 and day='2026-11-18' and metric='lifecycle' and value<>0",
        [fixture.a],
      );
    expect((await snapshot()).rows).toEqual([]);
    await fixture.connection.pool.query(
      "update stores set time_zone='Atlantic/Azores' where id=$1",
      [fixture.a],
    );
    const clock = vi.mocked(app.get(Clock).now);
    clock.mockReturnValue(new Date('2026-11-19T00:15:00Z'));
    try {
      const event = {
        type: 'contact_stats.repaired',
        storeId: fixture.a,
        occurredAt: clock().toISOString(),
        payload: { day: '2026-11-18' },
      };
      const listener = app.get(ScheduleLifecycleOnStatsRepaired);
      await listener.handle({ ...event, id: randomUUID() });
      await listener.handle({ ...event, id: randomUUID() });
      const queue = app.get<Queue>(getQueueToken(QUEUES.bulk));
      expect(
        (await queue.getWaiting()).filter((job) => {
          return job.data.storeId === fixture.a && job.data.page.kind === 'lifecycle';
        }),
      ).toHaveLength(1);
      clock.mockReturnValue(new Date('2026-11-19T01:15:00Z'));
      const handler = app.get(ReconcileAnalyticsJob);
      const worker = new Worker(QUEUES.bulk, ({ data }) => handler.handle(data), {
        connection: toRedisConnection(loadEnv().REDIS_URL),
        prefix: queue.opts.prefix,
      });
      const jobId = `${RECONCILE_ANALYTICS}-${fixture.a}-2026-11-18-lifecycle-start`;
      try {
        await vi.waitFor(async () => {
          expect((await snapshot()).rows).toEqual([{ dimension: 'regulars', value: '1' }]);
          expect(Boolean(await queue.getJob(jobId))).toBe(false);
        });
        await fixture.connection.pool.query(
          "update contact_stats set lifecycle_stage='best' where store_id=$1 and contact_id=$2",
          [fixture.a, eligible],
        );
        await listener.handle({ ...event, id: randomUUID() });
        await vi.waitFor(async () => {
          expect((await snapshot()).rows).toEqual([{ dimension: 'best', value: '1' }]);
        });
      } finally {
        await worker.close();
      }
    } finally {
      clock.mockReturnValue(now);
      await fixture.connection.pool.query(
        "delete from store_daily_metrics where store_id=$1 and metric='lifecycle' and day='2026-11-18'",
        [fixture.a],
      );
      await fixture.connection.pool.query("update stores set time_zone='Asia/Dhaka' where id=$1", [
        fixture.a,
      ]);
    }
  });

  it('prunes expired report rows and preserves other features and stores', async () => {
    await fixture.connection.pool.query(
      `insert into store_daily_metrics(store_id,day,metric,dimension,value) values
       ($1,'2024-11-19','orders','',8),($1,'2024-11-18','sales','manual',20),
       ($1,'2024-11-18','ai_runs','',2),($2,'2024-11-18','sales','manual',5)`,
      [fixture.a, fixture.b],
    );
    await app.get(ReconcileAnalyticsJob).handle({
      storeId: fixture.a,
      day: '2026-11-19',
      page: { kind: 'retention', batch: 0 },
    });
    const { rows } = await fixture.connection.pool.query(
      `select metric, day::text from store_daily_metrics
       where store_id=$1 and day<'2026-11-19' order by day`,
      [fixture.a],
    );
    expect(rows).toEqual([
      { metric: 'ai_runs', day: '2024-11-18' },
      { metric: 'orders', day: '2024-11-19' },
    ]);
    expect(
      await fixture.connection.pool.query(
        "select 1 from store_daily_metrics where store_id=$1 and metric='sales'",
        [fixture.b],
      ),
    ).toMatchObject({ rowCount: 1 });
  });

  it('continues a nightly repair after UTC midnight', async () => {
    await fixture.connection.pool.query(
      `insert into orders(id,store_id,number,source,created_by_type,recipient_name,
        recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,cod_amount_poisha,created_at)
      values ($1,$2,1001,'manual','user','রিনা','01710000005','Mirpur','Dhaka',125000,125000,
        '2026-11-18T18:00:00Z')`,
      [randomUUID(), fixture.b],
    );
    await app.get(ReconcileAnalyticsJob).handle({
      storeId: fixture.b,
      day: '2026-11-18',
      page: { kind: 'orders', period: null },
    });
    const { rows } = await fixture.connection.pool.query(
      "select day::text,value from store_daily_metrics where store_id=$1 and metric='orders' and dimension=''",
      [fixture.b],
    );
    expect(rows).toEqual([{ day: '2026-11-19', value: '1' }]);
  });

  it('repairs stale spend on the original day when a return event was missed', async () => {
    await fixture.connection.pool.query(
      `insert into orders(id,store_id,number,source,created_by_type,recipient_name,
        recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,
        cod_amount_poisha,created_at,stage,payment_status)
      values ($1,$2,1001,'manual','user','রিনা','01710000005','Mirpur','Dhaka',125000,125000,
        '2026-11-07T18:00:00Z','returned','paid')`,
      [randomUUID(), fixture.a],
    );
    await fixture.connection.pool.query(
      `insert into store_daily_metrics(store_id,day,metric,value) values
       ($1,'2026-11-08','net_spend',125000),($1,'2026-11-08','delivered_orders',1)`,
      [fixture.a],
    );
    await app.get(ReconcileAnalyticsJob).handle({
      storeId: fixture.a,
      day: '2026-11-19',
      page: { kind: 'orders', period: { from: '2026-11-08', through: '2026-11-08' } },
    });
    const { rows } = await fixture.connection.pool.query(
      `select metric, value from store_daily_metrics
       where store_id=$1 and day='2026-11-08' and dimension='' order by metric`,
      [fixture.a],
    );
    expect(rows).toEqual([
      { metric: 'delivered_orders', value: '0' },
      { metric: 'net_spend', value: '0' },
      { metric: 'orders', value: '1' },
    ]);
  });

  it('schedules a repair for each maintenance store', async () => {
    await app.get(SweepAnalyticsJob).handle({});
    const queue = app.get<Queue>(getQueueToken(QUEUES.bulk));
    for (const storeId of [fixture.a, fixture.b]) {
      const job = await queue.getJob(`${RECONCILE_ANALYTICS}-${storeId}-2026-11-19-orders-start`);
      expect(job?.data).toEqual({
        storeId,
        day: '2026-11-19',
        page: { kind: 'orders', period: null },
      });
    }
  });

  it('continues past a full order day or buyer page', async () => {
    const storeId = fixture.b;
    const day = '2026-11-19';
    const repair = app.get(ReconcileAnalyticsJob);
    const queue = app.get<Queue>(getQueueToken(QUEUES.bulk));
    const countOrderDays = async () => {
      const { rowCount } = await fixture.connection.pool.query(
        "select 1 from store_daily_metrics where store_id=$1 and metric='orders' and day between '2026-07-01' and '2026-08-05'",
        [storeId],
      );
      return rowCount;
    };
    await repair.handle({
      storeId,
      day,
      page: { kind: 'orders', period: { from: '2026-07-01', through: '2026-08-05' } },
    });
    expect(await countOrderDays()).toBe(31);
    const orders = await queue.getJob(`${RECONCILE_ANALYTICS}-${storeId}-${day}-orders-2026-08-01`);
    await repair.handle(orders?.data);
    expect(await countOrderDays()).toBe(36);

    await fixture.connection.pool.query(
      `insert into store_daily_metrics (store_id,day,metric,dimension,value)
       select $1,'2026-10-11','buyer_activity',gen_random_uuid()::text,20737
       from generate_series(1,101)`,
      [storeId],
    );
    const buyers = await queue.getJob(`${RECONCILE_ANALYTICS}-${storeId}-${day}-buyers-start`);
    await repair.handle(buyers?.data);
    const { rows } = await fixture.connection.pool.query(
      "select dimension from store_daily_metrics where store_id=$1 and metric='buyer_activity'",
      [storeId],
    );
    expect(rows).toHaveLength(1);
    const next = (await queue.getWaiting()).find(({ data }) => {
      return data.storeId === storeId && data.page.kind === 'buyers' && data.page.after !== null;
    });
    await repair.handle(next?.data);
    const { rowCount } = await fixture.connection.pool.query(
      "select 1 from store_daily_metrics where store_id=$1 and metric='buyer_activity'",
      [storeId],
    );
    expect(rowCount).toBe(0);
  });

  it('continues past a full retention page', async () => {
    const storeId = fixture.b;
    const day = '2026-11-19';
    await fixture.connection.pool.query(
      `insert into store_daily_metrics (store_id,day,metric,dimension,value)
       select $1,'2024-06-19','buyer_activity',gen_random_uuid()::text,19893
       from generate_series(1,5001)`,
      [storeId],
    );
    const countExpired = async () => {
      const { rowCount } = await fixture.connection.pool.query(
        "select 1 from store_daily_metrics where store_id=$1 and metric='buyer_activity' and day='2024-06-19'",
        [storeId],
      );
      return rowCount;
    };
    const repair = app.get(ReconcileAnalyticsJob);
    await repair.handle({ storeId, day, page: { kind: 'retention', batch: 0 } });
    expect(await countExpired()).toBe(1);
    const queue = app.get<Queue>(getQueueToken(QUEUES.bulk));
    const next = await queue.getJob(`${RECONCILE_ANALYTICS}-${storeId}-${day}-retention-1`);
    await repair.handle(next?.data);
    expect(await countExpired()).toBe(0);
  });
});
