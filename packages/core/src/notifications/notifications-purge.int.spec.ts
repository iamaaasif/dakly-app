import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { TenantDatabase } from '../platform/database/tenant-database';
import { NotificationsRepository } from './notifications.repository';

describe('notification purge (Postgres)', () => {
  const fixture = new OwnerIsolationFixture();
  const owner = fixture.connection.pool;
  // The app role is what runs in production, so row level security and grants apply.
  const app = createDatabase(process.env.DATABASE_URL!);
  const repository = new NotificationsRepository(new TenantDatabase(app.db), app.db);
  const count = async (storeId: string) =>
    (
      await owner.query('select count(*)::int as total from notifications where store_id = $1', [
        storeId,
      ])
    ).rows[0].total as number;

  beforeAll(async () => {
    await fixture.setup();
    for (const [storeId, userId] of [
      [fixture.a, fixture.userA],
      [fixture.b, fixture.userB],
    ])
      for (const [days, key] of [
        [100, 'old-1'],
        [100, 'old-2'],
        [10, 'recent'],
      ])
        await owner.query(
          `insert into notifications (id, store_id, user_id, category, type, title, dedupe_key, created_at)
           values ($1, $2, $3, 'fix_now', 'conversation.handed_over', 'নতুন অর্ডার', $4, now() - make_interval(days => $5))`,
          [randomUUID(), storeId, userId, key, days],
        );
  });
  afterAll(async () => {
    await owner.query('delete from notifications where store_id = any($1::uuid[])', [
      [fixture.a, fixture.b],
    ]);
    await Promise.all([fixture.close(), app.pool.end()]);
  });

  // Other specs update notification rows at the same time. A locked row is skipped on purpose and
  // left for the next run, so the test repeats a batch until it has made progress.
  async function purgeUntil(limit: number, expected: number) {
    for (let attempt = 0; attempt < 40 && (await count(fixture.a)) > expected; attempt++) {
      await repository.purgeExpiredBatch(fixture.a, limit);
      await setTimeout(50);
    }
  }

  it('deletes a bounded batch of notifications older than 90 days for one store only', async () => {
    await purgeUntil(1, 2);
    expect(await count(fixture.a)).toBe(2);
    await purgeUntil(5, 1);
    expect(await count(fixture.a)).toBe(1);
    expect(await count(fixture.b)).toBe(3);
  });
});
