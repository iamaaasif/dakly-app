import 'reflect-metadata';
import { createHash } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { sessions, users } from '@dakly/db/schema/auth';

import { AccountSecurityEventsModule } from '../account-security-events/account-security-events.module';
import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import { UsersModule } from '../auth/users.module';
import { UsersService } from '../auth/users.service';
import { Clock } from '../platform/clock';
import { AccountDatabase } from '../platform/database/account-database';
import { AccountTransaction } from '../platform/database/account-transaction';
import { DatabaseModule } from '../platform/database/database.module';
import { TeamService } from '../team/team.service';
import { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

class AuditTestModule {}
Module({ imports: [DatabaseModule, AccountSecurityEventsModule, UsersModule] })(AuditTestModule);

// Real storage catches plaintext tokens, stale renewal, missing user filters and non-atomic audit.
describe('SessionsService (Postgres)', () => {
  const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const app = createDatabase(process.env.DATABASE_URL!);
  let context: INestApplicationContext;
  let repository: SessionsRepository;
  const clock = { now: () => new Date(time) };
  let time = Date.now();
  let events: AccountSecurityEventsService;
  let service: SessionsService;
  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    context = await NestFactory.createApplicationContext(AuditTestModule, { logger: false });
    const account = context.get(AccountDatabase);
    repository = new SessionsRepository(app.db, account);
    events = context.get(AccountSecurityEventsService);
    service = new SessionsService(
      repository,
      new AccountTransaction(account),
      events,
      clock as Clock,
      {} as TeamService,
      context.get(UsersService),
    );
    const rows = await admin.db
      .insert(users)
      .values([
        { name: 'Rahim', email: `sessions-${crypto.randomUUID()}@example.test` },
        { name: 'Rina', email: `sessions-${crypto.randomUUID()}@example.test` },
      ])
      .returning({ id: users.id });
    userId = rows[0]!.id;
    otherUserId = rows[1]!.id;
  });
  afterAll(async () => {
    await admin.db.execute(
      sql`delete from account_security_events where user_id in (${userId}, ${otherUserId})`,
    );
    await admin.db.delete(users).where(sql`${users.id} in (${userId}, ${otherUserId})`);
    await context.close();
    await Promise.all([admin.pool.end(), app.pool.end()]);
  });

  it.each([false, true])(
    'stores only the hash and applies remembered=%s lifetime',
    async (isRemembered) => {
      const created = await service.create(userId, { isRemembered });
      expect(Buffer.from(created.token, 'base64url')).toHaveLength(32);
      const [row] = await admin.db
        .select()
        .from(sessions)
        .where(eq(sessions.id, created.session.id));
      expect(row!.tokenHash).toEqual(createHash('sha256').update(created.token).digest());
      expect(row!.expiresAt.getTime() - time).toBe(isRemembered ? 2592000000 : 43200000);
      expect(await service.resolve(created.token)).toMatchObject({ id: row!.id, userId });
    },
  );

  it('slides expiry only after five minutes and never revives expired or revoked rows', async () => {
    const created = await service.create(userId, { isRemembered: false });
    time += 299999;
    await service.resolve(created.token);
    let [row] = await admin.db.select().from(sessions).where(eq(sessions.id, created.session.id));
    expect(row!.lastSeenAt.getTime()).toBe(time - 299999);
    time = Date.now();
    await admin.db
      .update(sessions)
      .set({ lastSeenAt: new Date(time - 300000) })
      .where(eq(sessions.id, created.session.id));
    await service.resolve(created.token);
    [row] = await admin.db.select().from(sessions).where(eq(sessions.id, created.session.id));
    expect(row!.lastSeenAt.getTime()).toBeGreaterThanOrEqual(time);
    expect(row!.expiresAt.getTime() - row!.lastSeenAt.getTime()).toBe(43200000);
    await service.revoke(userId, created.session.id);
    expect(await service.resolve(created.token)).toBeUndefined();
    const expired = await service.create(userId, { isRemembered: false });
    time += 43200000;
    expect(await service.resolve(expired.token)).toBeUndefined();
    expect(await service.resolve('unknown')).toBeUndefined();
  });

  // Moving the row back a day is the same as a day passing; renewal reads database time.
  async function moveBackOneDay(sessionId: string) {
    await admin.db
      .update(sessions)
      .set({
        createdAt: sql`${sessions.createdAt} - interval '1 day'`,
        lastSeenAt: sql`${sessions.lastSeenAt} - interval '1 day'`,
        expiresAt: sql`${sessions.expiresAt} - interval '1 day'`,
      })
      .where(eq(sessions.id, sessionId));
    time = Date.now();
  }

  it('ends a remembered session used every day at day 90', async () => {
    time = Date.now();
    const created = await service.create(userId, { isRemembered: true });
    for (let day = 1; day < 90; day++) {
      await moveBackOneDay(created.session.id);
      expect(await service.resolve(created.token)).toMatchObject({ id: created.session.id });
      const [row] = await admin.db
        .select()
        .from(sessions)
        .where(eq(sessions.id, created.session.id));
      const cap = row!.createdAt.getTime() + 90 * 86400000;
      if (day >= 60) expect(row!.expiresAt.getTime()).toBe(cap);
      else expect(row!.expiresAt.getTime() - row!.lastSeenAt.getTime()).toBe(2592000000);
    }
    await moveBackOneDay(created.session.id);
    expect(await service.resolve(created.token)).toBeUndefined();
  });

  it('keeps the 12 hour idle lifetime for a session far from the cap', async () => {
    time = Date.now();
    const created = await service.create(userId, { isRemembered: false });
    await admin.db
      .update(sessions)
      .set({ createdAt: new Date(time - 89 * 86400000), lastSeenAt: new Date(time - 600000) })
      .where(eq(sessions.id, created.session.id));
    await service.resolve(created.token);
    const [row] = await admin.db.select().from(sessions).where(eq(sessions.id, created.session.id));
    expect(row!.lastSeenAt.getTime()).toBeGreaterThanOrEqual(time);
    expect(row!.expiresAt.getTime() - row!.lastSeenAt.getTime()).toBe(43200000);
  });

  it('renews a session used at day 89 only until day 90', async () => {
    time = Date.now();
    const created = await service.create(userId, { isRemembered: true });
    const createdAt = new Date(time - 89 * 86400000);
    await admin.db
      .update(sessions)
      .set({ createdAt, lastSeenAt: new Date(time - 86400000) })
      .where(eq(sessions.id, created.session.id));
    await service.resolve(created.token);
    const [row] = await admin.db.select().from(sessions).where(eq(sessions.id, created.session.id));
    const cap = createdAt.getTime() + 90 * 86400000;
    expect(row!.expiresAt.getTime()).toBe(cap);
    time = cap - 1;
    expect(await service.resolve(created.token)).toMatchObject({ id: created.session.id });
    time = cap;
    expect(await service.resolve(created.token)).toBeUndefined();
  });

  it('does not extend a session that expires while its lookup is paused', async () => {
    const created = await service.create(userId, { isRemembered: false });
    const original = repository.findByTokenHash.bind(repository);
    const spy = vi.spyOn(repository, 'findByTokenHash').mockImplementationOnce(async (...args) => {
      const row = await original(...args);
      time += 43200001;
      return row;
    });
    expect(await service.resolve(created.token)).toBeUndefined();
    spy.mockRestore();
    const [row] = await admin.db.select().from(sessions).where(eq(sessions.id, created.session.id));
    expect(row!.expiresAt).toEqual(created.session.expiresAt);
  });

  it('does not renew after expiry while account transaction acquisition is paused', async () => {
    time = Date.now();
    const created = await service.create(userId, { isRemembered: false });
    const deadline = new Date(time + 250);
    await admin.db
      .update(sessions)
      .set({ lastSeenAt: new Date(time - 600000), expiresAt: deadline })
      .where(eq(sessions.id, created.session.id));
    const account = context.get(AccountDatabase);
    const original = account.forUser.bind(account);
    const entered = deferred();
    const resume = deferred();
    const pause = vi.spyOn(account, 'forUser').mockImplementationOnce(async (...args) => {
      entered.resolve();
      await resume.promise;
      return original(...args);
    });
    const pending = service.resolve(created.token);
    try {
      await entered.promise;
      await waitUntilExpired(deadline);
    } finally {
      resume.resolve();
      await pending;
      pause.mockRestore();
    }
    const [row] = await admin.db.select().from(sessions).where(eq(sessions.id, created.session.id));
    expect(row!.expiresAt).toEqual(deadline);
    time = Date.now();
    expect(await service.resolve(created.token)).toBeUndefined();
  });

  it('uses a fresh renewal timestamp after transaction acquisition resumes', async () => {
    time = Date.now();
    const created = await service.create(userId, { isRemembered: false });
    await admin.db
      .update(sessions)
      .set({ lastSeenAt: new Date(time - 600000) })
      .where(eq(sessions.id, created.session.id));
    const account = context.get(AccountDatabase);
    const original = account.forUser.bind(account);
    const entered = deferred();
    const resume = deferred();
    const pause = vi.spyOn(account, 'forUser').mockImplementationOnce(async (...args) => {
      entered.resolve();
      await resume.promise;
      return original(...args);
    });
    const pending = service.resolve(created.token);
    let releasedAt: Date;
    try {
      await entered.promise;
      await admin.db.execute(sql`select pg_sleep(0.05)`);
      releasedAt = new Date();
    } finally {
      resume.resolve();
      await pending;
      pause.mockRestore();
    }
    const [row] = await admin.db.select().from(sessions).where(eq(sessions.id, created.session.id));
    expect(row!.lastSeenAt.getTime()).toBeGreaterThanOrEqual(releasedAt!.getTime());
    expect(row!.expiresAt.getTime() - row!.lastSeenAt.getTime()).toBe(43200000);
  });

  it('does not renew after expiry while waiting for an unchanged row lock', async () => {
    time = Date.now();
    const created = await service.create(userId, { isRemembered: false });
    const deadline = new Date(time + 2000);
    await admin.db
      .update(sessions)
      .set({ lastSeenAt: new Date(time - 600000), expiresAt: deadline })
      .where(eq(sessions.id, created.session.id));
    const blocker = await admin.pool.connect();
    await blocker.query('begin');
    const { rows } = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
    await blocker.query('select id from sessions where id = $1 for update', [created.session.id]);
    const pending = service.resolve(created.token);
    try {
      await vi.waitFor(
        async () => {
          const blocked = await admin.db.execute<{ count: number }>(
            sql`select count(*)::int as count from pg_stat_activity where ${rows[0]!.pid} = any(pg_blocking_pids(pid))`,
          );
          expect(blocked.rows[0]!.count).toBeGreaterThan(0);
        },
        { timeout: 1500, interval: 10 },
      );
      await waitUntilExpired(deadline);
    } finally {
      await blocker.query('commit');
      blocker.release();
      await pending;
    }
    const [row] = await admin.db.select().from(sessions).where(eq(sessions.id, created.session.id));
    expect(row!.expiresAt).toEqual(deadline);
    time = Date.now();
    expect(await service.resolve(created.token)).toBeUndefined();
  });

  it('keeps concurrent valid resolutions authorised when the second touch is throttled', async () => {
    time = Date.now();
    const created = await service.create(userId, { isRemembered: false });
    await admin.db
      .update(sessions)
      .set({ lastSeenAt: new Date(time - 600000) })
      .where(eq(sessions.id, created.session.id));
    const read = repository.findByTokenHash.bind(repository);
    const bothRead = deferred();
    let reads = 0;
    const lookup = vi.spyOn(repository, 'findByTokenHash').mockImplementation(async (...args) => {
      const result = await read(...args);
      if (++reads === 2) bothRead.resolve();
      await bothRead.promise;
      return result;
    });
    const touch = repository.touch.bind(repository);
    const firstTouched = deferred();
    let firstVersion: string | undefined;
    const renew = vi
      .spyOn(repository, 'touch')
      .mockImplementationOnce(async (...args) => {
        await touch(...args);
        const result = await admin.db.execute<{ version: string }>(
          sql`select xmin::text as version from sessions where id = ${created.session.id}`,
        );
        firstVersion = result.rows[0]!.version;
        firstTouched.resolve();
      })
      .mockImplementationOnce(async (...args) => {
        await firstTouched.promise;
        await touch(...args);
      });
    try {
      const results = await Promise.all([
        service.resolve(created.token),
        service.resolve(created.token),
      ]);
      expect(results.map((session) => session?.id)).toEqual([
        created.session.id,
        created.session.id,
      ]);
      const result = await admin.db.execute<{ version: string }>(
        sql`select xmin::text as version from sessions where id = ${created.session.id}`,
      );
      expect(result.rows[0]!.version).toBe(firstVersion);
    } finally {
      lookup.mockRestore();
      renew.mockRestore();
    }
  });

  async function waitUntilExpired(deadline: Date) {
    await admin.db.execute(
      sql`select pg_sleep(greatest(0, extract(epoch from (${deadline.toISOString()}::timestamptz - clock_timestamp()))) + 0.025)`,
    );
  }

  it('rolls back revocation when the account event cannot be written', async () => {
    const created = await service.create(userId, { isRemembered: false });
    const failure = vi
      .spyOn(events, 'record')
      .mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(service.revoke(userId, created.session.id)).rejects.toThrow('Audit unavailable');
    failure.mockRestore();
    expect(await service.resolve(created.token)).toMatchObject({ id: created.session.id });
    const history = await events.list(userId, { limit: 100 });
    expect(history.filter((event) => event.details.sessionId === created.session.id)).toHaveLength(
      0,
    );
  });

  it('revokes other sessions only for the subject and writes one account event', async () => {
    const current = await service.create(userId, { isRemembered: true });
    const other = await service.create(userId, { isRemembered: true });
    const stranger = await service.create(otherUserId, { isRemembered: true });
    await service.revokeOthers(userId, current.session.id);
    expect(await service.resolve(current.token)).toBeDefined();
    expect(await service.resolve(other.token)).toBeUndefined();
    expect(await service.resolve(stranger.token)).toBeDefined();
    await service.revoke(userId, stranger.session.id);
    expect(await service.resolve(stranger.token)).toBeDefined();
    const history = await events.list(userId, { limit: 100 });
    expect(history.filter((event) => event.details.sessionId === current.session.id)).toHaveLength(
      1,
    );
  });
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
