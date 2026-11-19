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
import { AnalyticsSummariesService } from './analytics-summaries.service';
import { AnalyticsModule } from './analytics.module';
import { BuildOrderSummaryJob } from './jobs/build-order-summary.job';
import { SummarizeOrderCodCollected } from './jobs/summarize-order-cod-collected.job';
import { SummarizeOrderCreated } from './jobs/summarize-order-created.job';
import { SummarizeOrderStageChanged } from './jobs/summarize-order-stage-changed.job';

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
          prefix: `${env.QUEUE_PREFIX}:order-summaries`,
        };
      },
    }),
  ],
})(TestModule);

describe('Daily order summaries', () => {
  const fixture = new OwnerIsolationFixture();
  let app: INestApplicationContext;
  let queue: Queue;
  const now = new Date('2026-11-19T06:00:00Z');
  let number = 1000;

  beforeAll(async () => {
    await fixture.setup();
    await fixture.connection.pool.query("update stores set time_zone='UTC' where id=$1", [
      fixture.b,
    ]);
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    queue = app.get(getQueueToken(QUEUES.sync));
    vi.spyOn(app.get(Clock), 'now').mockReturnValue(now);
  });

  afterAll(async () => {
    await app?.close();
    for (const table of ['orders', 'store_daily_metrics', 'outbox_events']) {
      await fixture.connection.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
        [fixture.a, fixture.b],
      ]);
    }
    await fixture.close();
  });

  async function order(storeId: string, createdAt: string, contactId: string | null = null) {
    const id = randomUUID();
    await fixture.connection.pool.query(
      `insert into orders(id,store_id,number,source,created_by_type,recipient_name,
         recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,
         cod_amount_poisha,created_at,buyer_contact_id)
       values ($1,$2,$3,'manual','user','রিনা','01710000005','Mirpur','Dhaka',125000,125000,$4,$5)`,
      [id, storeId, ++number, createdAt, contactId],
    );
    return id;
  }

  async function ordersFor(storeId: string) {
    const { rows } = await fixture.connection.pool.query(
      `select day::text, value, updated_at from store_daily_metrics
       where store_id=$1 and metric='orders' and dimension='' order by day`,
      [storeId],
    );
    return rows;
  }

  function event(storeId: string, orderId: string) {
    return { id: randomUUID(), storeId, occurredAt: now.toISOString(), payload: { orderId } };
  }

  async function finishOrderDay(storeId: string, day: string) {
    const jobs = await queue.getDelayed();
    const job = jobs.find(({ data }) => data.storeId === storeId && data.day === day);
    await app.get(BuildOrderSummaryJob).handle(job?.data);
    await job?.remove();
  }

  it('uses the creation day in each store’s time zone', async () => {
    const beforeMidnight = await order(fixture.a, '2026-11-08T17:59:59Z');
    const atMidnight = await order(fixture.a, '2026-11-08T18:00:00Z');
    const foreign = await order(fixture.b, '2026-11-08T18:00:00Z');
    const handler = app.get(SummarizeOrderCreated);
    for (const [storeId, orderId] of [
      [fixture.a, beforeMidnight],
      [fixture.a, atMidnight],
      [fixture.b, foreign],
      [fixture.b, atMidnight],
    ] as const) {
      await handler.handle({ ...event(storeId, orderId), type: 'order.created' });
    }
    await finishOrderDay(fixture.a, '2026-11-08');
    await finishOrderDay(fixture.a, '2026-11-09');
    await finishOrderDay(fixture.b, '2026-11-08');
    expect(await ordersFor(fixture.a)).toMatchObject([
      { day: '2026-11-08', value: '1' },
      { day: '2026-11-09', value: '1' },
    ]);
    expect(await ordersFor(fixture.b)).toMatchObject([{ day: '2026-11-08', value: '1' }]);
  });

  it('queues one refresh for two order events on the same store day', async () => {
    const first = await order(fixture.a, '2026-10-26T05:00:00Z');
    const second = await order(fixture.a, '2026-10-26T06:00:00Z');
    const handler = app.get(SummarizeOrderCreated);
    for (const orderId of [first, second]) {
      await handler.handle({ ...event(fixture.a, orderId), type: 'order.created' });
    }
    const jobs = await queue.getDelayed();
    expect(jobs.map(({ data, opts }) => ({ ...data, delay: opts.delay }))).toEqual([
      { storeId: fixture.a, day: '2026-10-26', delay: 60000 },
    ]);
    await finishOrderDay(fixture.a, '2026-10-26');
    expect(await ordersFor(fixture.a)).toContainEqual(
      expect.objectContaining({ day: '2026-10-26', value: '2' }),
    );
  });

  it('runs another refresh when an order commits while its day is being written', async () => {
    const day = '2026-10-27';
    const clock = vi.mocked(app.get(Clock).now);
    clock.mockReturnValue(new Date('2026-11-19T06:00:59.990Z'));
    const env = loadEnv();
    const release = Promise.withResolvers<void>();
    const summary = app.get(BuildOrderSummaryJob);
    const worker = new Worker(
      QUEUES.sync,
      async (job) => {
        await summary.handle(job.data);
        await release.promise;
      },
      {
        connection: toRedisConnection(env.REDIS_URL),
        prefix: `${env.QUEUE_PREFIX}:order-summaries`,
      },
    );
    const handler = app.get(SummarizeOrderCreated);
    try {
      const first = await order(fixture.a, `${day}T05:00:00Z`);
      await handler.handle({ ...event(fixture.a, first), type: 'order.created' });
      await expect
        .poll(() => ordersFor(fixture.a))
        .toContainEqual(expect.objectContaining({ day, value: '1' }));
      const second = await order(fixture.a, `${day}T06:00:00Z`);
      await handler.handle({ ...event(fixture.a, second), type: 'order.created' });
      release.resolve();
      await expect
        .poll(() => ordersFor(fixture.a))
        .toContainEqual(expect.objectContaining({ day, value: '2' }));
    } finally {
      release.resolve();
      await worker.close();
      clock.mockReturnValue(now);
    }
  });

  it('does not restore a day that aged out while its refresh was queued', async () => {
    const clock = vi.mocked(app.get(Clock).now);
    clock.mockReturnValue(new Date('2026-11-19T17:59:59Z'));
    try {
      const orderId = await order(fixture.a, '2024-11-19T05:00:00Z');
      await app.get(SummarizeOrderCreated).handle({
        ...event(fixture.a, orderId),
        type: 'order.created',
      });
      clock.mockReturnValue(new Date('2026-11-19T18:00:00Z'));
      await finishOrderDay(fixture.a, '2024-11-19');
      expect(await ordersFor(fixture.a)).not.toContainEqual(
        expect.objectContaining({ day: '2024-11-19' }),
      );
    } finally {
      clock.mockReturnValue(now);
    }
  });

  it('retries the source event when the day could not be queued', async () => {
    const orderId = await order(fixture.a, '2026-11-04T05:00:00Z');
    const data = { ...event(fixture.a, orderId), type: 'order.created' };
    const handler = app.get(SummarizeOrderCreated);
    const enqueue = vi.spyOn(queue, 'add').mockRejectedValueOnce(new Error('Queue unavailable'));
    try {
      await expect(handler.handle(data)).rejects.toThrow('Queue unavailable');
      await handler.handle(data);
      await finishOrderDay(fixture.a, '2026-11-04');
      expect(await ordersFor(fixture.a)).toContainEqual(
        expect.objectContaining({ day: '2026-11-04', value: '1' }),
      );
    } finally {
      enqueue.mockRestore();
    }
  });

  it('restates the original day after cancellation and leaves replay unchanged', async () => {
    const orderId = await order(fixture.a, '2026-11-01T05:00:00Z');
    await app.get(SummarizeOrderCreated).handle({
      ...event(fixture.a, orderId),
      type: 'order.created',
    });
    await finishOrderDay(fixture.a, '2026-11-01');
    await fixture.connection.pool.query(
      "update orders set stage='cancelled', cancel_reason='customer_cancelled' where id=$1",
      [orderId],
    );
    const handler = app.get(SummarizeOrderStageChanged);
    const change = {
      ...event(fixture.a, orderId),
      type: 'order.stage_changed',
      payload: { orderId, from: 'to_confirm', to: 'cancelled' },
    };
    await handler.handle(change);
    await finishOrderDay(fixture.a, '2026-11-01');
    const restated = await ordersFor(fixture.a);
    expect(restated).toContainEqual(expect.objectContaining({ day: '2026-11-01', value: '0' }));
    expect(restated.some(({ day }) => day === '2026-11-19')).toBe(false);
    await handler.handle(change);
    await finishOrderDay(fixture.a, '2026-11-01');
    expect(await ordersFor(fixture.a)).toEqual(restated);
  });

  it('restates net spend and delivered orders on the original day after a late return', async () => {
    const orderId = await order(fixture.a, '2026-10-20T18:30:00Z');
    const handler = app.get(SummarizeOrderStageChanged);
    await fixture.connection.pool.query(
      "update orders set stage='delivered', order_discount_poisha=500 where id=$1",
      [orderId],
    );
    await handler.handle({
      ...event(fixture.a, orderId),
      type: 'order.stage_changed',
      payload: { orderId, from: 'with_courier', to: 'delivered' },
    });
    await finishOrderDay(fixture.a, '2026-10-21');
    const metrics = async () =>
      (
        await fixture.connection.pool.query(
          `select day::text, metric, value from store_daily_metrics
           where store_id=$1 and day in ('2026-10-21','2026-11-19')
             and metric in ('orders','net_spend','delivered_orders') and dimension='' order by metric`,
          [fixture.a],
        )
      ).rows;
    expect(await metrics()).toContainEqual({ day: '2026-10-21', metric: 'net_spend', value: '0' });
    await fixture.connection.pool.query(
      "update orders set payment_status='cod_collected', cod_collected_poisha=cod_amount_poisha where id=$1",
      [orderId],
    );
    await app.get(SummarizeOrderCodCollected).handle({
      ...event(fixture.a, orderId),
      type: 'order.cod_collected',
    });
    await finishOrderDay(fixture.a, '2026-10-21');
    expect(await metrics()).toEqual([
      { day: '2026-10-21', metric: 'delivered_orders', value: '1' },
      { day: '2026-10-21', metric: 'net_spend', value: '124500' },
      { day: '2026-10-21', metric: 'orders', value: '1' },
    ]);
    await fixture.connection.pool.query("update orders set stage='returned' where id=$1", [
      orderId,
    ]);
    const returned = {
      ...event(fixture.a, orderId),
      type: 'order.stage_changed',
      payload: { orderId, from: 'delivered', to: 'returned' },
    };
    await handler.handle(returned);
    await finishOrderDay(fixture.a, '2026-10-21');
    const restated = await metrics();
    expect(restated).toEqual([
      { day: '2026-10-21', metric: 'delivered_orders', value: '0' },
      { day: '2026-10-21', metric: 'net_spend', value: '0' },
      { day: '2026-10-21', metric: 'orders', value: '1' },
    ]);
    await handler.handle(returned);
    await finishOrderDay(fixture.a, '2026-10-21');
    expect(await metrics()).toEqual(restated);
  });

  it('replays a source event without rewriting unchanged results', async () => {
    const day = '2026-11-02';
    const orderId = await order(fixture.a, `${day}T12:00:00Z`);
    const created = { ...event(fixture.a, orderId), type: 'order.created' };
    const handler = app.get(SummarizeOrderCreated);
    await handler.handle(created);
    await finishOrderDay(fixture.a, day);
    const before = await ordersFor(fixture.a);
    const clock = vi.mocked(app.get(Clock).now);
    clock.mockReturnValue(new Date('2026-11-19T06:01:00Z'));
    try {
      await handler.handle(created);
      await finishOrderDay(fixture.a, day);
      expect(await ordersFor(fixture.a)).toEqual(before);
    } finally {
      clock.mockReturnValue(now);
    }
  });

  it('records discounted item sales by source and restates a cancellation', async () => {
    const day = '2026-11-05';
    const manual = await order(fixture.a, `${day}T05:00:00Z`);
    const returned = await order(fixture.a, `${day}T06:00:00Z`);
    await fixture.connection.pool.query(
      'update orders set order_discount_poisha=500, delivery_charge_poisha=4500 where id=$1',
      [manual],
    );
    await fixture.connection.pool.query(
      "update orders set source='order_link', stage='returned' where id=$1",
      [returned],
    );
    const created = app.get(SummarizeOrderCreated);
    for (const id of [manual, returned]) {
      await created.handle({ ...event(fixture.a, id), type: 'order.created' });
    }
    await finishOrderDay(fixture.a, day);
    const sales = async () =>
      (
        await fixture.connection.pool.query(
          "select dimension, value from store_daily_metrics where store_id=$1 and day=$2 and metric='sales' and value<>0 order by dimension",
          [fixture.a, day],
        )
      ).rows;
    expect(await sales()).toEqual([
      { dimension: 'manual', value: '124500' },
      { dimension: 'order_link', value: '125000' },
    ]);
    await fixture.connection.pool.query(
      "update orders set stage='cancelled', cancel_reason='customer_cancelled' where id=$1",
      [manual],
    );
    await app.get(SummarizeOrderStageChanged).handle({
      ...event(fixture.a, manual),
      type: 'order.stage_changed',
      payload: { orderId: manual, from: 'to_confirm', to: 'cancelled' },
    });
    await finishOrderDay(fixture.a, day);
    expect(await sales()).toEqual([{ dimension: 'order_link', value: '125000' }]);
  });

  it('moves the first order day on every buyer activity row after a cancellation', async () => {
    const contactId = randomUUID();
    await fixture.connection.pool.query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা','manual','customer')",
      [contactId, fixture.a],
    );
    const first = await order(fixture.a, '2026-11-03T12:00:00Z', contactId);
    await order(fixture.a, '2026-11-10T12:00:00Z', contactId);
    const activities = async () =>
      (
        await fixture.connection.pool.query(
          `select day::text, (date '1970-01-01' + value::int)::text as first_day
       from store_daily_metrics where store_id=$1 and metric='buyer_activity' and dimension=$2
       order by day`,
          [fixture.a, contactId],
        )
      ).rows;
    await app.get(SummarizeOrderCreated).handle({
      ...event(fixture.a, first),
      type: 'order.created',
    });
    expect(await activities()).toEqual([
      { day: '2026-11-03', first_day: '2026-11-03' },
      { day: '2026-11-10', first_day: '2026-11-03' },
    ]);
    await fixture.connection.pool.query(
      "update orders set stage='cancelled', cancel_reason='customer_cancelled' where id=$1",
      [first],
    );
    await app.get(SummarizeOrderStageChanged).handle({
      ...event(fixture.a, first),
      type: 'order.stage_changed',
      payload: { orderId: first, from: 'to_confirm', to: 'cancelled' },
    });
    expect(await activities()).toEqual([{ day: '2026-11-10', first_day: '2026-11-10' }]);
  });
  it('rebuilds a date range from orders, including an old missing cancellation', async () => {
    await order(fixture.a, '2026-11-13T06:00:00Z');
    const cancelled = await order(fixture.a, '2026-11-14T06:00:00Z');
    const worker = app.get(SummarizeOrderCreated);
    await worker.handle({ ...event(fixture.a, cancelled), type: 'order.created' });
    await finishOrderDay(fixture.a, '2026-11-14');
    await fixture.connection.pool.query(
      "update orders set stage='cancelled', cancel_reason='other' where id=$1",
      [cancelled],
    );
    const summaries = app.get(AnalyticsSummariesService);
    await summaries.refreshOrderDays(fixture.a, { from: '2026-11-13', through: '2026-11-14' });
    const rows = (await ordersFor(fixture.a)).filter(({ day }) =>
      ['2026-11-13', '2026-11-14'].includes(day),
    );
    expect(rows).toMatchObject([
      { day: '2026-11-13', value: '1' },
      { day: '2026-11-14', value: '0' },
    ]);
  });

  it('repairs a missing buyer day and removes activity for an excluded buyer', async () => {
    const contactId = randomUUID();
    await fixture.connection.pool.query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'সুমন','manual','customer')",
      [contactId, fixture.a],
    );
    await order(fixture.a, '2026-11-15T12:00:00Z', contactId);
    const repairs = app.get(AnalyticsSummariesService);
    const activity = async () =>
      (
        await fixture.connection.pool.query(
          "select day::text from store_daily_metrics where store_id=$1 and metric='buyer_activity' and dimension=$2",
          [fixture.a, contactId],
        )
      ).rows;
    await repairs.reconcileBuyerPage(fixture.a, null);
    expect(await activity()).toEqual([{ day: '2026-11-15' }]);
    await fixture.connection.pool.query('update contacts set is_blocked=true where id=$1', [
      contactId,
    ]);
    await repairs.reconcileBuyerPage(fixture.a, null);
    expect(await activity()).toEqual([]);
  });
});
