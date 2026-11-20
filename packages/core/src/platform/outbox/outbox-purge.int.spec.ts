import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { TenantDatabase } from '../database/tenant-database';
import { OutboxRepository } from './outbox.repository';

describe('outbox purge (Postgres)', () => {
  const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
  // The app role is what runs in production, so grants apply.
  const app = createDatabase(process.env.DATABASE_URL!);
  const repository = new OutboxRepository(app.db, new TenantDatabase(app.db));
  const storeId = randomUUID();
  const remaining = async () =>
    (
      await admin.pool.query(
        'select count(*)::int as total from outbox_events where store_id = $1',
        [storeId],
      )
    ).rows[0].total as number;

  beforeAll(async () => {
    for (const [publishedDaysAgo, claimed] of [
      [10, true],
      [8, true],
      [3, true],
      [null, false],
    ] as const)
      await admin.pool.query(
        `insert into outbox_events (id, store_id, type, payload, claimed_at, published_at)
         values ($1, $2, 'contact.created', '{}',
           case when $4 then now() end,
           case when $3::int is null then null else now() - make_interval(days => $3::int) end)`,
        [randomUUID(), storeId, publishedDaysAgo, claimed],
      );
  });
  afterAll(async () => {
    await admin.pool.query('delete from outbox_events where store_id = $1', [storeId]);
    await Promise.all([admin.pool.end(), app.pool.end()]);
  });

  it('deletes events published over 7 days ago in bounded batches and keeps the rest', async () => {
    // The purge is global, so a batch may take another spec's expired row; only the size is exact.
    expect(await repository.purgePublishedBatch(1)).toBe(1);
    while ((await repository.purgePublishedBatch(5000)) > 0);
    expect(await remaining()).toBe(2);
  });

  it('refuses a batch size outside 1 to 5000', async () => {
    await expect(repository.purgePublishedBatch(0)).rejects.toThrow();
    await expect(repository.purgePublishedBatch(5001)).rejects.toThrow();
  });
});
