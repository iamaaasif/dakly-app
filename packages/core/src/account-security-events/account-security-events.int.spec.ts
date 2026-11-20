import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

const admin = new Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
const app = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => Promise.all([admin.end(), app.end()]));

describe('account security storage (Postgres)', () => {
  it('keeps events for two years and purges only a bounded expired batch as owner', async () => {
    const client = await admin.connect();
    const userId = randomUUID();
    try {
      await client.query('begin');
      await client.query('insert into users (id, name, email) values ($1, $2, $3)', [
        userId,
        'রিনা',
        `${userId}@example.test`,
      ]);
      await client.query(
        `insert into account_security_events (id, user_id, event, actor_type, created_at)
        values ($1, $4, 'password.changed', 'user', now() - interval '3 years'),
               ($2, $4, 'password.changed', 'user', now() - interval '3 years'),
               ($3, $4, 'password.changed', 'user', now() - interval '2 years')`,
        [randomUUID(), randomUUID(), randomUUID(), userId],
      );
      expect((await client.query('select purge_account_security_events(1) as count')).rows).toEqual(
        [{ count: 1 }],
      );
      expect(
        (await client.query('select purge_account_security_events(1000) as count')).rows,
      ).toEqual([{ count: 1 }]);
      expect(
        (
          await client.query(
            'select count(*)::int as count from account_security_events where user_id = $1',
            [userId],
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
    } finally {
      await client.query('rollback');
      client.release();
    }
  });

  it('lets the app role purge expired history through the function and nothing newer', async () => {
    const userId = randomUUID();
    await admin.query('insert into users (id, name, email) values ($1, $2, $3)', [
      userId,
      'রিনা',
      `${userId}@example.test`,
    ]);
    try {
      await admin.query(
        `insert into account_security_events (id, user_id, event, actor_type, created_at)
        values ($1, $3, 'password.changed', 'user', now() - interval '3 years'),
               ($2, $3, 'password.changed', 'user', now() - interval '1 year')`,
        [randomUUID(), randomUUID(), userId],
      );
      await expect(app.query('delete from account_security_events')).rejects.toMatchObject({
        code: '42501',
      });
      await app.query('select purge_account_security_events(1000)');
      const left = await admin.query(
        'select count(*)::int as count from account_security_events where user_id = $1',
        [userId],
      );
      expect(left.rows).toEqual([{ count: 1 }]);
    } finally {
      await admin.query('delete from account_security_events where user_id = $1', [userId]);
      await admin.query('delete from users where id = $1', [userId]);
    }
  });

  it('rejects invalid purge bounds instead of deleting an unbounded batch', async () => {
    for (const limit of [null, 0, -1, 1001]) {
      await expect(
        admin.query('select purge_account_security_events($1)', [limit]),
      ).rejects.toMatchObject({ code: '22023' });
    }
  });
  it('stores account history globally and retains it when a user is deleted', async () => {
    const metadata = await admin.query(
      "select relrowsecurity from pg_class where oid = 'public.account_security_events'::regclass",
    );
    expect(metadata.rows).toEqual([{ relrowsecurity: false }]);
    const client = await admin.connect();
    const userId = randomUUID();
    try {
      await client.query('begin');
      await client.query('insert into users (id, name, email) values ($1, $2, $3)', [
        userId,
        'রিনা',
        `${userId}@example.test`,
      ]);
      await client.query(
        "insert into account_security_events (id, user_id, event, actor_type) values ($1, $2, 'password.changed', 'user')",
        [randomUUID(), userId],
      );
      await expect(client.query('delete from users where id = $1', [userId])).rejects.toMatchObject(
        { code: '23503' },
      );
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
  it('rejects personal details and staff events with missing attribution at the database boundary', async () => {
    const client = await admin.connect();
    const userId = randomUUID();
    try {
      await client.query('begin');
      await client.query('insert into users (id, name, email) values ($1, $2, $3)', [
        userId,
        'রিনা',
        `${userId}@example.test`,
      ]);
      for (const details of [
        { phone: '01712345678' },
        { sessionId: 'personal text' },
        { sessionId: null },
      ]) {
        await client.query('savepoint invalid_entry');
        await expect(
          client.query(
            "insert into account_security_events (id, user_id, event, actor_type, details) values ($1, $2, 'password.changed', 'user', $3)",
            [randomUUID(), userId, details],
          ),
        ).rejects.toMatchObject({ code: '23514' });
        await client.query('rollback to savepoint invalid_entry');
      }
      await expect(
        client.query(
          "insert into account_security_events (id, user_id, event, actor_type) values ($1, $2, 'recovery.completed', 'staff')",
          [randomUUID(), userId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
  it('denies app updates and deletes', async () => {
    for (const query of [
      'update account_security_events set event = event',
      'delete from account_security_events',
    ]) {
      await expect(app.query(query)).rejects.toMatchObject({ code: '42501' });
    }
  });
});
