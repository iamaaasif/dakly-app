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
import { RECONCILE_ANALYTICS } from './analytics-reconciliation.service';
import { AnalyticsRepairModule } from './analytics-repair.module';
import { ReconcileAnalyticsJob } from './jobs/reconcile-analytics.job';
import { ScheduleLifecycleOnStatsRepaired } from './jobs/schedule-lifecycle-on-stats-repaired.job';

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
      const queued = await queue.getJob(
        `${RECONCILE_ANALYTICS}-${fixture.a}-2026-11-18-lifecycle-start`,
      );
      expect(
        (await queue.getWaiting()).filter((job) => {
          return job.data.storeId === fixture.a && job.data.page.kind === 'lifecycle';
        }),
      ).toHaveLength(1);
      clock.mockReturnValue(new Date('2026-11-19T01:15:00Z'));
      await app.get(ReconcileAnalyticsJob).handle(queued?.data);
      const expected = [{ dimension: 'regulars', value: '1' }];
      expect((await snapshot()).rows).toEqual(expected);
      await fixture.connection.pool.query(
        "update contact_stats set lifecycle_stage='best' where store_id=$1 and contact_id=$2",
        [fixture.a, eligible],
      );
      await app.get(ReconcileAnalyticsJob).handle(queued?.data);
      expect((await snapshot()).rows).toEqual(expected);
      await queued?.remove();
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
});
