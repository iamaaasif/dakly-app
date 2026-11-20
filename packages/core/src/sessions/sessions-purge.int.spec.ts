import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { AccountDatabase } from '../platform/database/account-database';
import { SessionsRepository } from './sessions.repository';

describe('session purge (Postgres)', () => {
  const fixture = new OwnerIsolationFixture();
  const owner = fixture.connection.pool;
  // The app role is what runs in production, so row level security and grants apply.
  const app = createDatabase(process.env.DATABASE_URL!);
  const repository = new SessionsRepository(app.db, new AccountDatabase(app.db));
  const users = () => [fixture.userA, fixture.userB];

  beforeAll(async () => {
    await fixture.setup();
    await owner.query('delete from sessions where user_id = any($1::uuid[])', [users()]);
    for (const [userId, days] of [
      [fixture.userA, -1],
      [fixture.userB, -1],
      [fixture.userA, 7],
    ])
      await owner.query(
        `insert into sessions (id, token_hash, user_id, expires_at)
         values ($1, $2, $3, now() + make_interval(days => $4))`,
        [randomUUID(), Buffer.from(randomUUID()), userId, days],
      );
  });
  afterAll(async () => {
    await owner.query('delete from sessions where user_id = any($1::uuid[])', [users()]);
    await Promise.all([fixture.close(), app.pool.end()]);
  });

  it('deletes expired sessions in bounded batches and keeps live ones', async () => {
    const left = async () =>
      (
        await owner.query(
          'select count(*)::int as total from sessions where user_id = any($1::uuid[])',
          [users()],
        )
      ).rows[0].total as number;
    // Other expired sessions in a shared test database count toward the batch, so only the total is checked.
    while (await repository.purgeExpiredBatch(100));
    expect(await left()).toBe(1);
  });
});
