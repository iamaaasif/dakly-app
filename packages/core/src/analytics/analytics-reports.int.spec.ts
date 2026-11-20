import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { AnalyticsReportsModule } from './analytics-reports.module';
import { AnalyticsService } from './analytics.service';

class TestModule {}
Module({ imports: [DatabaseModule, AnalyticsReportsModule] })(TestModule);

describe('Analytics reports', () => {
  const fixture = new OwnerIsolationFixture();
  const period = { from: '2026-11-05', through: '2026-11-07' };
  let app: INestApplicationContext;
  let reports: AnalyticsService;

  beforeAll(async () => {
    await fixture.setup();
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    vi.spyOn(app.get(Clock), 'now').mockReturnValue(new Date('2026-11-07T18:00:00Z'));
    reports = app.get(AnalyticsService);
  });

  afterAll(async () => {
    await app?.close();
    for (const table of ['orders', 'product_variants', 'products'])
      await fixture.connection.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
        [fixture.a, fixture.b],
      ]);
    await fixture.connection.pool.query(
      'delete from store_daily_metrics where store_id=any($1::uuid[])',
      [[fixture.a, fixture.b]],
    );
    await fixture.close();
  });

  it('chooses store-local calendar days and the preceding period', async () => {
    expect(await reports.periods(fixture.a, 7)).toEqual({
      asOf: '2026-11-07T18:00:00.000Z',
      timeZone: 'Asia/Dhaka',
      current: { from: '2026-11-02', through: '2026-11-08' },
      previous: { from: '2026-10-26', through: '2026-11-01' },
    });
    expect(await reports.periods(fixture.a, 365)).toMatchObject({
      current: { from: '2025-11-09', through: '2026-11-08' },
      previous: { from: '2024-11-09', through: '2025-11-08' },
    });
  });

  it('uses stored order totals and fills dates without a summary', async () => {
    await fixture.connection.pool.query(
      `insert into store_daily_metrics (store_id,day,metric,value) values
        ($1,'2026-11-05','orders',3),($1,'2026-11-07','orders',1),($2,'2026-11-05','orders',9)`,
      [fixture.a, fixture.b],
    );
    expect(await reports.orders(fixture.a, period)).toEqual({
      total: 4n,
      points: [
        { day: '2026-11-05', value: 3n },
        { day: '2026-11-06', value: 0n },
        { day: '2026-11-07', value: 1n },
      ],
    });
    expect((await reports.orders(fixture.b, period)).total).toBe(9n);
  });

  it('sums Sales across order sources and keeps Delivered sales separate', async () => {
    await fixture.connection.pool.query(
      `insert into store_daily_metrics (store_id,day,metric,dimension,value) values
       ($1,'2026-11-05','sales','manual',125000),($1,'2026-11-05','sales','order_link',50000),
       ($1,'2026-11-07','sales','manual',10000),($1,'2026-11-06','net_spend','',25010),
       ($2,'2026-11-05','sales','manual',500000)`,
      [fixture.a, fixture.b],
    );
    expect(await reports.sales(fixture.a, period)).toEqual({
      total: 185000n,
      bySource: { manual: 135000n, order_link: 50000n },
      points: [
        { day: '2026-11-05', value: 175000n },
        { day: '2026-11-06', value: 0n },
        { day: '2026-11-07', value: 10000n },
      ],
    });
    expect((await reports.deliveredSales(fixture.a, period)).total).toBe(25010n);
    expect((await reports.sales(fixture.b, period)).total).toBe(500000n);
  });

  it('divides period net spend by delivered orders in integer poisha', async () => {
    const averagePeriod = { from: '2026-11-09', through: '2026-11-11' };
    await fixture.connection.pool.query(
      `insert into store_daily_metrics (store_id,day,metric,value) values
       ($1,'2026-11-09','net_spend',10001),($1,'2026-11-09','delivered_orders',2),
       ($1,'2026-11-11','net_spend',20001),($1,'2026-11-11','delivered_orders',3)`,
      [fixture.a],
    );
    expect(await reports.averageOrderValue(fixture.a, averagePeriod)).toEqual({
      total: 6000n,
      points: [
        { day: '2026-11-09', value: 5001n },
        { day: '2026-11-10', value: 0n },
        { day: '2026-11-11', value: 6667n },
      ],
    });
    expect((await reports.averageOrderValue(fixture.b, averagePeriod)).total).toBe(0n);
  });

  it('counts a returning buyer once and keeps first-time buyers separate', async () => {
    await fixture.connection.pool.query(
      `insert into store_daily_metrics (store_id,day,metric,dimension,value) values
       ($1,'2026-11-05','buyer_activity',$2,date '2026-10-30' - date '1970-01-01'),
       ($1,'2026-11-07','buyer_activity',$2,date '2026-10-30' - date '1970-01-01'),
       ($1,'2026-11-05','buyer_activity',$3,date '2026-11-05' - date '1970-01-01'),
       ($1,'2026-11-06','buyer_activity',$3,date '2026-11-05' - date '1970-01-01'),
       ($1,'2026-11-07','buyer_activity',$4,date '2026-11-07' - date '1970-01-01')`,
      [fixture.a, randomUUID(), randomUUID(), randomUUID()],
    );
    expect((await reports.newCustomers(fixture.a, period)).total).toBe(2n);
    expect(await reports.customersWhoCameBack(fixture.a, period)).toEqual({
      total: 1n,
      points: [
        { day: '2026-11-05', value: 1n },
        { day: '2026-11-06', value: 0n },
        { day: '2026-11-07', value: 1n },
      ],
    });
  });

  it('reads the latest lifecycle snapshot through the period end', async () => {
    await fixture.connection.pool.query(
      `insert into store_daily_metrics (store_id,day,metric,dimension,value) values
       ($1,'2026-11-05','lifecycle','new',4),($1,'2026-11-07','lifecycle','new',3),
       ($1,'2026-11-07','lifecycle','regulars',2),($1,'2026-11-08','lifecycle','new',21),
       ($2,'2026-11-07','lifecycle','new',18)`,
      [fixture.a, fixture.b],
    );
    expect(await reports.lifecycleCounts(fixture.a, period)).toEqual({
      stopped_buying: 0,
      best: 0,
      slipping_away: 0,
      new: 3,
      regulars: 2,
      bought_once: 0,
    });
  });

  it('chooses today, yesterday and month-to-date against the period before', async () => {
    expect(await reports.calendarPeriods(fixture.a, 'today')).toMatchObject({
      timeZone: 'Asia/Dhaka',
      current: { from: '2026-11-08', through: '2026-11-08' },
      previous: { from: '2026-11-07', through: '2026-11-07' },
    });
    expect(await reports.calendarPeriods(fixture.a, 'yesterday')).toMatchObject({
      current: { from: '2026-11-07', through: '2026-11-07' },
      previous: { from: '2026-11-06', through: '2026-11-06' },
    });
    expect(await reports.calendarPeriods(fixture.a, 'this_month')).toMatchObject({
      current: { from: '2026-11-01', through: '2026-11-08' },
      previous: { from: '2026-10-01', through: '2026-10-08' },
    });
  });

  describe('top products', () => {
    async function sell(
      storeId: string,
      productName: string,
      lines: { createdAt: string; quantity: number; stage?: string }[],
    ) {
      const productId = randomUUID();
      const variantId = randomUUID();
      const { pool } = fixture.connection;
      await pool.query(
        'insert into products(id,store_id,name,is_stock_tracked) values($1,$2,$3,false)',
        [productId, storeId, productName],
      );
      await pool.query(
        "insert into product_variants(id,store_id,product_id,title) values($1,$2,$3,'M')",
        [variantId, storeId, productId],
      );
      for (const { createdAt, quantity, stage = 'to_confirm' } of lines) {
        const orderId = randomUUID();
        await pool.query(
          `insert into orders(id,store_id,number,source,created_by_type,recipient_name,recipient_phone,
             recipient_address,recipient_district,items_subtotal_poisha,cod_amount_poisha,created_at,stage,
             cancel_reason)
           values ($1,$2,$3,'manual','user','রিনা','01710000005','Mirpur','Dhaka',1,1,$4,$5,
             case when $5 = 'cancelled' then 'not_confirmed' end)`,
          [orderId, storeId, Math.floor(Math.random() * 1e9), createdAt, stage],
        );
        await pool.query(
          `insert into order_items(id,store_id,order_id,variant_id,product_name,variant_title,quantity,
             unit_price_poisha,line_discount_poisha,is_stock_tracked)
           values ($1,$2,$3,$4,$5,'M',$6,50000,10000,false)`,
          [randomUUID(), storeId, orderId, variantId, productName, quantity],
        );
      }
    }

    it('ranks products by items sold, leaves out cancelled orders and other shops', async () => {
      await sell(fixture.a, 'পাঞ্জাবি', [
        { createdAt: '2026-11-05T06:00:00Z', quantity: 2 },
        { createdAt: '2026-11-06T06:00:00Z', quantity: 1 },
      ]);
      await sell(fixture.a, 'শাড়ি', [
        { createdAt: '2026-11-06T06:00:00Z', quantity: 2 },
        { createdAt: '2026-11-06T07:00:00Z', quantity: 9, stage: 'cancelled' },
        // Outside the period, so it does not count.
        { createdAt: '2026-10-01T06:00:00Z', quantity: 20 },
      ]);
      await sell(fixture.b, 'অন্য দোকানের পণ্য', [
        { createdAt: '2026-11-06T06:00:00Z', quantity: 50 },
      ]);
      expect(await reports.topProducts(fixture.a, period, 5)).toEqual([
        { name: 'পাঞ্জাবি', units: 3, salesPoisha: 3n * 50000n - 2n * 10000n },
        { name: 'শাড়ি', units: 2, salesPoisha: 2n * 50000n - 10000n },
      ]);
      expect((await reports.topProducts(fixture.a, period, 1)).map(({ name }) => name)).toEqual([
        'পাঞ্জাবি',
      ]);
      expect((await reports.topProducts(fixture.b, period, 5)).map(({ name }) => name)).toEqual([
        'অন্য দোকানের পণ্য',
      ]);
    });
  });
});
