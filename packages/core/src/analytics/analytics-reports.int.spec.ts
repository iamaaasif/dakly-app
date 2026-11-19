import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { AnalyticsModule } from './analytics.module';
import { AnalyticsService } from './analytics.service';

class TestModule {}
Module({ imports: [DatabaseModule, AnalyticsModule] })(TestModule);

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
    await fixture.connection.pool.query(
      'delete from store_daily_metrics where store_id=any($1::uuid[])',
      [[fixture.a, fixture.b]],
    );
    await fixture.close();
  });

  it('chooses store-local calendar days and the preceding period', async () => {
    expect(await reports.periods(fixture.a, 7)).toEqual({
      current: { from: '2026-11-02', through: '2026-11-08' },
      previous: { from: '2026-10-26', through: '2026-11-01' },
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

  it('divides period net spend by delivered orders in integer poisha', async () => {
    await fixture.connection.pool.query(
      `insert into store_daily_metrics (store_id,day,metric,value) values
       ($1,'2026-11-05','net_spend',10001),($1,'2026-11-05','delivered_orders',2),
       ($1,'2026-11-07','net_spend',20001),($1,'2026-11-07','delivered_orders',3)`,
      [fixture.a],
    );
    expect(await reports.averageOrderValue(fixture.a, period)).toEqual({
      total: 6000n,
      points: [
        { day: '2026-11-05', value: 5001n },
        { day: '2026-11-06', value: 0n },
        { day: '2026-11-07', value: 6667n },
      ],
    });
    expect((await reports.averageOrderValue(fixture.b, period)).total).toBe(0n);
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
});
