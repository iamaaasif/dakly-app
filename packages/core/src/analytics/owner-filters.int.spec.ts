import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { AnalyticsRepository } from './analytics.repository';

describe('analytics writes without RLS assistance', () => {
  const fixture = new OwnerIsolationFixture();
  const repository = new AnalyticsRepository(fixture.tenant);
  const now = new Date('2026-11-19T06:00:00Z');

  beforeAll(() => fixture.setup());
  afterAll(async () => {
    await fixture.connection.pool.query(
      'delete from store_daily_metrics where store_id=any($1::uuid[])',
      [[fixture.a, fixture.b]],
    );
    await fixture.close();
  });

  it('replaces buyer days only in the selected store', async () => {
    const dimension = randomUUID();
    for (const storeId of [fixture.a, fixture.b]) {
      await repository.save(
        storeId,
        [{ day: '2026-11-05', metric: 'buyer_activity', dimension, value: 20762n }],
        now,
      );
    }
    await repository.replaceBuyerActivity(fixture.a, dimension, [], now);
    const { rows } = await fixture.connection.pool.query(
      'select store_id from store_daily_metrics where store_id=any($1::uuid[]) and dimension=$2',
      [[fixture.a, fixture.b], dimension],
    );
    expect(rows).toEqual([{ store_id: fixture.b }]);
  });
  it('reads report days and lifecycle counts only for the selected store', async () => {
    const day = '2026-11-05';
    const period = { from: day, through: '2026-11-07' };
    const a = fixture.a;
    const b = fixture.b;
    await repository.save(
      a,
      [
        { day, metric: 'sales', dimension: 'manual', value: 12000n },
        { day, metric: 'buyer_activity', dimension: randomUUID(), value: 20100n },
        { day, metric: 'lifecycle', dimension: 'new', value: 2n },
      ],
      now,
    );
    await repository.save(
      b,
      [
        { day, metric: 'sales', dimension: 'manual', value: 50000n },
        { day, metric: 'buyer_activity', dimension: randomUUID(), value: 20100n },
        { day: '2026-11-06', metric: 'lifecycle', dimension: 'best', value: 7n },
      ],
      now,
    );
    expect(await repository.readDailyMetrics(a, period, ['sales'])).toEqual([
      { day, metric: 'sales', dimension: 'manual', value: 12000n },
    ]);
    expect(await repository.readBuyers(a, period, 'returning')).toHaveLength(2);
    expect(await repository.readBuyers(a, period, 'returning')).toContainEqual({
      day: null,
      value: '1',
    });
    expect(await repository.readLifecycle(a, period)).toEqual([{ dimension: 'new', value: '2' }]);
  });
});
