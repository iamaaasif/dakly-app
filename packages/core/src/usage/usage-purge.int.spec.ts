import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { TenantDatabase } from '../platform/database/tenant-database';
import { UsageRepository } from './usage.repository';

describe('usage event purge (Postgres)', () => {
  const fixture = new OwnerIsolationFixture();
  const owner = fixture.connection.pool;
  // The app role is what runs in production, so it must have no direct DELETE right.
  const app = createDatabase(process.env.DATABASE_URL!);
  const repository = new UsageRepository(new TenantDatabase(app.db), app.db);
  const remaining = async (storeId: string) =>
    (
      await owner.query('select count(*)::int as total from usage_events where store_id = $1', [
        storeId,
      ])
    ).rows[0].total as number;

  beforeAll(async () => {
    await fixture.setup();
    for (const [storeId, monthsAgo] of [
      [fixture.a, 14],
      [fixture.a, 14],
      [fixture.a, 12],
      [fixture.a, 0],
      [fixture.b, 14],
    ] as const)
      await owner.query(
        `insert into usage_events (id, store_id, unit, quantity, source, reference, period_start)
         values ($1, $2, 'ai_ask', 1, 'allowance', $3,
           (now() at time zone 'utc')::date - make_interval(months => $4))`,
        [randomUUID(), storeId, randomUUID(), monthsAgo],
      );
  });
  afterAll(async () => {
    await owner.query('delete from usage_events where store_id = any($1::uuid[])', [
      [fixture.a, fixture.b],
    ]);
    await Promise.all([fixture.close(), app.pool.end()]);
  });

  it('deletes events whose period started over 13 months ago, in batches, in every store', async () => {
    await expect(app.pool.query('delete from usage_events')).rejects.toMatchObject({
      code: '42501',
    });
    expect(await repository.purgeExpiredBatch(1)).toBe(1);
    while ((await repository.purgeExpiredBatch(5000)) > 0);
    expect(await remaining(fixture.a)).toBe(2);
    expect(await remaining(fixture.b)).toBe(0);
  });

  it('refuses a batch size outside 1 to 5000', async () => {
    await expect(repository.purgeExpiredBatch(0)).rejects.toThrow();
    await expect(repository.purgeExpiredBatch(5001)).rejects.toThrow();
  });
});
