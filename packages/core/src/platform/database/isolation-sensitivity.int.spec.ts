import { randomUUID } from 'node:crypto';
import { createDatabase } from '@dakly/db/client';
import { afterAll, describe, expect, it } from 'vitest';

// Only this disposable relation is changed; application policies and role privileges stay intact.
describe('isolation assertion sensitivity', () => {
  const owner = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const app = createDatabase(process.env.DATABASE_URL!);
  const schema = `isolation_${randomUUID().replaceAll('-', '')}`;
  const a = randomUUID(),
    b = randomUUID();
  const assertOnlyOwn = (rows: { store_id: string }[]) => expect(rows).toEqual([{ store_id: a }]);
  async function read() {
    const client = await app.pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.store_id',$1,true)", [a]);
      const result = await client.query<{ store_id: string }>(
        `select store_id from ${schema}.rows`,
      );
      await client.query('rollback');
      return result.rows;
    } finally {
      client.release();
    }
  }
  afterAll(async () => {
    await owner.pool.query(`drop schema if exists ${schema} cascade`);
    await Promise.all([owner.pool.end(), app.pool.end()]);
  });
  it('detects extra foreign rows with no policy and missing expected rows with a deny-all policy', async () => {
    await owner.pool.query(`create schema ${schema}`);
    await owner.pool.query(`create table ${schema}.rows(store_id uuid not null)`);
    await owner.pool.query(`grant usage on schema ${schema} to dakly_app`);
    await owner.pool.query(`grant select on ${schema}.rows to dakly_app`);
    await owner.pool.query(`insert into ${schema}.rows values($1),($2)`, [a, b]);
    await owner.pool.query(`alter table ${schema}.rows enable row level security`);
    await owner.pool.query(
      `create policy tenant on ${schema}.rows using(store_id=current_setting('app.store_id',true)::uuid)`,
    );
    assertOnlyOwn(await read());
    await owner.pool.query(`alter table ${schema}.rows disable row level security`);
    const unprotected = await read();
    expect(unprotected).toHaveLength(2);
    expect(() => assertOnlyOwn(unprotected)).toThrow();
    await owner.pool.query(`alter table ${schema}.rows enable row level security`);
    await owner.pool.query(`drop policy tenant on ${schema}.rows`);
    const denied = await read();
    expect(denied).toEqual([]);
    expect(() => assertOnlyOwn(denied)).toThrow();
  });
});
