import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '@dakly/db/client';
import { sessions, users } from '@dakly/db/schema/auth';
import { AccountDatabase } from '../platform/database/account-database';
import { AccountTransaction } from '../platform/database/account-transaction';
import { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';
import { Clock } from '../platform/clock';
import { AccountSecurityEventsService } from '../account-security-events/account-security-events.service';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { DatabaseModule } from '../platform/database/database.module';
import { AccountSecurityEventsModule } from '../account-security-events/account-security-events.module';
import { TeamService } from '../team/team.service';

class AuditTestModule {}
Module({ imports: [DatabaseModule, AccountSecurityEventsModule] })(AuditTestModule);

// Real storage catches plaintext tokens, stale renewal, missing user filters and non-atomic audit.
describe('SessionsService (Postgres)', () => {
  const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const app = createDatabase(process.env.DATABASE_URL!);
  let context: INestApplicationContext;
  let repository: SessionsRepository;
  const clock = { now: () => new Date(time) };
  let time = Date.parse('2026-11-13T10:00:00Z');
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
    time += 1;
    await service.resolve(created.token);
    [row] = await admin.db.select().from(sessions).where(eq(sessions.id, created.session.id));
    expect(row!.lastSeenAt.getTime()).toBe(time);
    expect(row!.expiresAt.getTime()).toBe(time + 43200000);
    await service.revoke(userId, created.session.id);
    expect(await service.resolve(created.token)).toBeUndefined();
    const expired = await service.create(userId, { isRemembered: false });
    time += 43200000;
    expect(await service.resolve(expired.token)).toBeUndefined();
    expect(await service.resolve('unknown')).toBeUndefined();
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
