import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@dakly/db/client';
import { staffUsers } from '@dakly/db/schema/admin';
import { users } from '@dakly/db/schema/auth';
import { AccountDatabase } from '../platform/database/account-database';
import { AccountTransaction } from '../platform/database/account-transaction';
import { TenantDatabase } from '../platform/database/tenant-database';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AccountSecurityEventsRepository } from './account-security-events.repository';
import { AccountSecurityEventsService } from './account-security-events.service';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const app = createDatabase(process.env.DATABASE_URL!);
const database = new AccountDatabase(app.db);
const transaction = new AccountTransaction(database);
const stores = new StoreTransaction(new TenantDatabase(app.db));
const service = new AccountSecurityEventsService(new AccountSecurityEventsRepository(database));
const userId = randomUUID();
const otherUserId = randomUUID();
const staffId = randomUUID();
const event = { event: 'password.changed' as const, actor: { kind: 'user' as const } };
beforeAll(() =>
  admin.db.insert(users).values([
    { id: userId, name: 'রিনা', email: `${userId}@example.test` },
    { id: otherUserId, name: 'সুমি', email: `${otherUserId}@example.test` },
  ]),
);
beforeAll(() =>
  admin.db
    .insert(staffUsers)
    .values({ id: staffId, name: 'সাপোর্ট', email: `${staffId}@example.test`, role: 'support' }),
);
beforeEach(async () => {
  await admin.db.execute(sql`delete from account_security_events where user_id = ${userId}`);
  await admin.db.execute(sql`delete from sessions where user_id = ${userId}`);
  await admin.db.execute(sql`update users set password_hash = 'hashed' where id = ${userId}`);
});
afterAll(async () => {
  await admin.db.execute(
    sql`delete from account_security_events where user_id in (${userId}, ${otherUserId})`,
  );
  await admin.db.execute(sql`delete from users where id in (${userId}, ${otherUserId})`);
  await admin.db.execute(sql`delete from staff_users where id = ${staffId}`);
  await Promise.all([admin.pool.end(), app.pool.end()]);
});

describe('AccountSecurityEventsService (Postgres)', () => {
  it('commits a user change and an event without any store, then scopes history to that user', async () => {
    await transaction.run(userId, async () => {
      await database.forUser(userId, (tx) =>
        tx.execute(sql`update users set password_hash = 'committed-password' where id = ${userId}`),
      );
      await service.record(userId, event);
    });
    expect(
      (await admin.db.execute(sql`select password_hash from users where id = ${userId}`)).rows,
    ).toEqual([{ password_hash: 'committed-password' }]);
    expect(await service.list(userId, { limit: 10 })).toMatchObject([
      { event: 'password.changed', actorType: 'user' },
    ]);
    expect(await service.list(otherUserId, { limit: 10 })).toEqual([]);
  });
  it('rolls back user and session changes with their events', async () => {
    await expect(
      transaction.run(userId, async () => {
        await database.forUser(userId, (tx) =>
          tx.execute(sql`update users set password_hash = 'rollback' where id = ${userId}`),
        );
        await database.forUser(userId, (tx) =>
          tx.execute(
            sql`insert into sessions (id, user_id, token_hash, expires_at) values (${randomUUID()}, ${userId}, ${Buffer.from(randomUUID())}, now() + interval '1 day')`,
          ),
        );
        await service.record(userId, { ...event, event: 'sessions.revoked' });
        throw new Error('caller failed');
      }),
    ).rejects.toThrow('caller failed');
    expect(
      (await admin.db.execute(sql`select password_hash from users where id = ${userId}`)).rows,
    ).toEqual([{ password_hash: 'hashed' }]);
    expect(
      (await admin.db.execute(sql`select id from sessions where user_id = ${userId}`)).rows,
    ).toEqual([]);
    expect(await service.list(userId, { limit: 10 })).toHaveLength(0);
  });
  it('rolls back a user mutation if the event fails', async () => {
    await expect(
      transaction.run(userId, async () => {
        await database.forUser(userId, (tx) =>
          tx.execute(sql`update users set password_hash = 'unaudited' where id = ${userId}`),
        );
        await service.record(userId, {
          ...event,
          actor: { kind: 'staff', staffId: randomUUID(), reasonType: 'lost_phone' },
        });
      }),
    ).rejects.toThrow();
    expect(
      (await admin.db.execute(sql`select password_hash from users where id = ${userId}`)).rows,
    ).toEqual([{ password_hash: 'hashed' }]);
  });
  it('commits session revocation and staff recovery attribution together', async () => {
    const sessionId = randomUUID();
    await admin.db.execute(
      sql`insert into sessions (id, user_id, token_hash, expires_at) values (${sessionId}, ${userId}, ${Buffer.from(randomUUID())}, now() + interval '1 day')`,
    );
    await transaction.run(userId, async () => {
      await database.forUser(userId, (tx) =>
        tx.execute(sql`update sessions set revoked_at = now() where user_id = ${userId}`),
      );
      await service.record(userId, {
        event: 'recovery.completed',
        actor: { kind: 'staff', staffId, reasonType: 'lost_authenticator' },
        details: { sessionId },
        ip: '127.0.0.1',
        userAgent: 'Test browser',
      });
    });
    expect(
      (
        await admin.db.execute(
          sql`select revoked_at is not null as is_revoked from sessions where id = ${sessionId}`,
        )
      ).rows,
    ).toEqual([{ is_revoked: true }]);
    expect(await service.list(userId, { limit: 10 })).toMatchObject([
      {
        event: 'recovery.completed',
        actorType: 'staff',
        actorStaffId: staffId,
        reasonType: 'lost_authenticator',
        details: { sessionId },
        ip: '127.0.0.1',
        userAgent: 'Test browser',
      },
    ]);
  });
  it('rolls back session revocation when the audit fails', async () => {
    const sessionId = randomUUID();
    await admin.db.execute(
      sql`insert into sessions (id, user_id, token_hash, expires_at) values (${sessionId}, ${userId}, ${Buffer.from(randomUUID())}, now() + interval '1 day')`,
    );
    await expect(
      transaction.run(userId, async () => {
        await database.forUser(userId, (tx) =>
          tx.execute(sql`update sessions set revoked_at = now() where user_id = ${userId}`),
        );
        await service.record(userId, {
          ...event,
          actor: { kind: 'staff', staffId: randomUUID(), reasonType: 'lost_phone' },
        });
      }),
    ).rejects.toThrow();
    expect(
      (
        await admin.db.execute(
          sql`select revoked_at is not null as is_revoked from sessions where id = ${sessionId}`,
        )
      ).rows,
    ).toEqual([{ is_revoked: false }]);
    expect(await service.list(userId, { limit: 10 })).toEqual([]);
  });
  it('requires a caller account action and refuses another user or tenant nesting', async () => {
    await expect(service.record(userId, event)).rejects.toThrow(
      'requires an active account transaction',
    );
    await expect(transaction.run(userId, () => service.record(otherUserId, event))).rejects.toThrow(
      'Cannot change users',
    );
    await expect(
      stores.run(randomUUID(), () => transaction.run(userId, async () => undefined)),
    ).rejects.toThrow('Cannot mix staff, account and store transactions');
    await expect(
      transaction.run(userId, () => stores.run(randomUUID(), async () => undefined)),
    ).rejects.toThrow('Cannot mix staff, account and store transactions');
  });
  it('rejects inherited work after its account action has finished', async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let late!: Promise<unknown>;
    await transaction.run(userId, async () => {
      late = gate.then(() => service.record(userId, event));
    });
    finish();
    await expect(late).rejects.toThrow('Account transaction has already finished');
  });
  it('pages history by id without crossing into another user', async () => {
    await transaction.run(userId, () => service.record(userId, event));
    await transaction.run(userId, () =>
      service.record(userId, { ...event, event: 'totp.enabled' }),
    );
    const first = await service.list(userId, { limit: 1 });
    expect(first).toMatchObject([{ event: 'totp.enabled' }]);
    expect(await service.list(userId, { limit: 1, before: first[0]!.id })).toMatchObject([
      { event: 'password.changed' },
    ]);
  });
});
