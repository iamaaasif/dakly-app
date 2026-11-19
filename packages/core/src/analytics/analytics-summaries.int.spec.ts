import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { AnalyticsModule } from './analytics.module';
import { SummarizeOrderCreated } from './jobs/summarize-order-created.job';
import { SummarizeOrderStageChanged } from './jobs/summarize-order-stage-changed.job';

class TestModule {}
Module({ imports: [DatabaseModule, AnalyticsModule] })(TestModule);

describe('Daily order summaries', () => {
  const fixture = new OwnerIsolationFixture();
  let app: INestApplicationContext;
  const now = new Date('2026-11-19T06:00:00Z');
  let number = 1000;

  beforeAll(async () => {
    await fixture.setup();
    await fixture.connection.pool.query("update stores set time_zone='UTC' where id=$1", [
      fixture.b,
    ]);
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    vi.spyOn(app.get(Clock), 'now').mockReturnValue(now);
  });

  afterAll(async () => {
    await app?.close();
    for (const table of ['orders', 'store_daily_metrics']) {
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
    expect(await ordersFor(fixture.a)).toMatchObject([
      { day: '2026-11-08', value: '1' },
      { day: '2026-11-09', value: '1' },
    ]);
    expect(await ordersFor(fixture.b)).toMatchObject([{ day: '2026-11-08', value: '1' }]);
  });

  it('restates the original day after cancellation and leaves replay unchanged', async () => {
    const orderId = await order(fixture.a, '2026-11-01T05:00:00Z');
    await app.get(SummarizeOrderCreated).handle({
      ...event(fixture.a, orderId),
      type: 'order.created',
    });
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
    const restated = await ordersFor(fixture.a);
    expect(restated).toContainEqual(expect.objectContaining({ day: '2026-11-01', value: '0' }));
    expect(restated.some(({ day }) => day === '2026-11-19')).toBe(false);
    vi.mocked(app.get(Clock).now).mockReturnValueOnce(new Date('2026-11-19T06:01:00Z'));
    await handler.handle(change);
    expect(await ordersFor(fixture.a)).toEqual(restated);
  });

  it('deduplicates a source event after it has already been applied', async () => {
    const orderId = await order(fixture.a, '2026-11-02T12:00:00Z');
    const created = { ...event(fixture.a, orderId), type: 'order.created' };
    const handler = app.get(SummarizeOrderCreated);
    await handler.handle(created);
    const before = await ordersFor(fixture.a);
    await order(fixture.a, '2026-11-02T12:30:00Z');
    await handler.handle(created);
    expect(await ordersFor(fixture.a)).toEqual(before);
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
});
