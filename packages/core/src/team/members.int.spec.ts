import 'reflect-metadata';
import { randomInt, randomUUID, createHash } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '@dakly/db/client';
import { users } from '@dakly/db/schema/auth';
import { stores } from '@dakly/db/schema/stores';
import { memberships } from '@dakly/db/schema/team';
import { plans, subscriptions } from '@dakly/db/schema/billing';
import { FakeSmsDriver } from '@dakly/providers/sms/fake-sms-driver';
import { MailpitSmsDriver } from '@dakly/providers/sms/mailpit/mailpit-sms-driver';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../platform/database/database.module';
import { SessionsService } from '../sessions/sessions.service';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { registerSessionCookies } from '../platform/http/session-cookie';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../auth/users.service';
import { EmailService } from '../email/email.service';
import { MembersRepository } from './members.repository';
import { InviteDelivery } from './invite-delivery';
import { roles } from '@dakly/db/schema/team';

class TestModule {}
Module({ imports: [DatabaseModule, AuthModule] })(TestModule);

describe('team membership over Fastify and Postgres', () => {
  const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const sms = new FakeSmsDriver();
  const storeIds: string[] = [];
  const userIds: string[] = [];
  let app: NestFastifyApplication;
  let planId: string;
  let owner: { id: string; phone: string; cookie: string };
  let member: { id: string; phone: string; cookie: string };
  let storeId: string;
  const phone = () => `017${randomInt(10000000, 99999999)}`;
  const request = (
    url: string,
    payload: object,
    cookie = owner.cookie,
    method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
  ) =>
    app.inject({
      method,
      url,
      payload,
      headers: { origin: 'http://localhost:3000', cookie },
      remoteAddress: `2001:db8::${randomInt(1, 65535).toString(16)}`,
    });
  const invite = (target = phone()) =>
    request('/members/invites', { phone: target, builtInRole: 'support_agent' });
  const tokenFor = (target: string) =>
    sms.messages.findLast((message) => message.to === target)!.text.match(/[a-f0-9]{64}/)![0];
  async function account() {
    const target = phone();
    const [user] = await admin.db
      .insert(users)
      .values({ name: 'রিনা', phone: target, phoneVerifiedAt: new Date() })
      .returning({ id: users.id });
    userIds.push(user!.id);
    const session = await app.get(SessionsService).create(user!.id, { isRemembered: false });
    return { id: user!.id, phone: target, cookie: `dakly_session=${session.token}` };
  }
  async function shop() {
    const [store] = await admin.db
      .insert(stores)
      .values({ name: 'Rina shop' })
      .returning({ id: stores.id });
    storeIds.push(store!.id);
    await admin.db.insert(subscriptions).values({
      storeId: store!.id,
      planId,
      status: 'active',
      currentPeriodPricePoisha: 0,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 86400000),
    });
    await admin.db
      .insert(memberships)
      .values({ storeId: store!.id, userId: owner.id, builtInRole: 'owner', status: 'active' });
    return store!.id;
  }
  beforeAll(async () => {
    vi.spyOn(MailpitSmsDriver.prototype, 'send').mockImplementation((message) => sms.send(message));
    app = await NestFactory.create<NestFastifyApplication>(TestModule, new FastifyAdapter(), {
      logger: false,
    });
    await registerSessionCookies(app);
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const [plan] = await admin.db
      .insert(plans)
      .values({
        code: randomUUID(),
        name: 'Team test',
        monthlyPricePoisha: 0,
        yearlyPricePoisha: 0,
        limits: { seats: 2 },
      })
      .returning({ id: plans.id });
    planId = plan!.id;
    owner = await account();
    member = await account();
    storeId = await shop();
    await request('/me/active-store', { storeId });
  });
  afterAll(async () => {
    await admin.pool.query('delete from audit_log where store_id = any($1::uuid[])', [storeIds]);
    await admin.db.delete(memberships).where(inArray(memberships.storeId, storeIds));
    await admin.db.delete(roles).where(inArray(roles.storeId, storeIds));
    await admin.db.delete(subscriptions).where(inArray(subscriptions.storeId, storeIds));
    await admin.pool.query('delete from sessions where user_id = any($1::uuid[])', [userIds]);
    await admin.db.delete(stores).where(inArray(stores.id, storeIds));
    await admin.db.delete(plans).where(eq(plans.id, planId));
    await admin.pool.query('delete from account_security_events where user_id = any($1::uuid[])', [
      userIds,
    ]);
    await admin.db.delete(users).where(inArray(users.id, userIds));
    await admin.pool.end();
    await app.close();
    vi.restoreAllMocks();
  });
  it('serializes the last seat, stores only a hash and lists a bounded page', async () => {
    const targets = [phone(), phone()];
    const responses = await Promise.all(targets.map(invite));
    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    expect(responses.find((response) => response.statusCode === 409)!.json().error.code).toBe(
      'TEAM_SEATS_FULL',
    );
    const result = responses.find((response) => response.statusCode === 201)!.json();
    const target = result.phone;
    const [row] = await admin.db.select().from(memberships).where(eq(memberships.id, result.id));
    expect(row!.inviteTokenHash).toEqual(createHash('sha256').update(tokenFor(target)).digest());
    expect(row!.inviteExpiresAt!.getTime() - Date.now()).toBeGreaterThan(6.99 * 86400000);
    const page = await app.inject({ url: '/members?limit=1', headers: { cookie: owner.cookie } });
    expect(page.statusCode).toBe(200);
    expect(page.json().items).toHaveLength(1);
    expect(page.json().seats).toEqual({ used: 2, limit: 2 });
    expect(page.json().nextCursor).toBeTruthy();
    expect(JSON.stringify(page.json())).not.toContain('inviteTokenHash');
    await request(`/members/${result.id}`, {}, owner.cookie, 'DELETE');
  });
  it('accepts into a second store, rejects token reuse and observes removal on the next request', async () => {
    const other = await shop();
    await admin.db
      .insert(memberships)
      .values({ storeId: other, userId: member.id, builtInRole: 'admin', status: 'active' });
    const response = await invite(member.phone);
    expect(response.statusCode).toBe(201);
    const token = tokenFor(member.phone);
    expect((await request('/invites/accept', { token }, member.cookie)).statusCode).toBe(200);
    expect((await request('/invites/accept', { token }, member.cookie)).json().error.code).toBe(
      'INVITE_INVALID',
    );
    await request('/me/active-store', { storeId }, member.cookie);
    expect(
      (await request(`/members/${response.json().id}`, {}, owner.cookie, 'DELETE')).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ url: '/members', headers: { cookie: member.cookie } })).statusCode,
    ).toBe(401);
    expect((await request('/me/active-store', { storeId: other }, member.cookie)).statusCode).toBe(
      204,
    );
  });
  it('rolls back invitations when audit fails and sends nothing', async () => {
    const before = sms.messages.length;
    const audit = vi
      .spyOn(app.get(AuditService), 'record')
      .mockRejectedValueOnce(new Error('audit unavailable'));
    const target = phone();
    expect((await invite(target)).statusCode).toBe(500);
    audit.mockRestore();
    expect(
      await admin.db.select().from(memberships).where(eq(memberships.invitePhone, target)),
    ).toEqual([]);
    expect(sms.messages).toHaveLength(before);
  });
  it('keeps a failed delivery committed and makes duplicate POST safe', async () => {
    vi.spyOn(MailpitSmsDriver.prototype, 'send').mockRejectedValueOnce(
      new Error('private provider data'),
    );
    const target = phone();
    expect((await invite(target)).json().error.code).toBe('INVITE_DELIVERY_UNAVAILABLE');
    const before = sms.messages.length;
    const retry = await invite(target);
    expect(retry.statusCode).toBe(201);
    expect(retry.json().status).toBe('invited');
    expect(sms.messages).toHaveLength(before);
    expect(
      (await request('/members/invites', { phone: target, builtInRole: 'admin' })).json().error
        .code,
    ).toBe('INVITE_EXISTS');
    await request(`/members/${retry.json().id}`, {}, owner.cookie, 'DELETE');
  });
  it('hides other-store members and roles and protects Owner on every management path', async () => {
    const other = await shop();
    const [foreign] = await admin.db
      .select()
      .from(memberships)
      .where(eq(memberships.storeId, other));
    const [own] = await admin.db
      .select()
      .from(memberships)
      .where(and(eq(memberships.storeId, storeId), eq(memberships.userId, owner.id)));
    const [role] = await admin.db
      .insert(roles)
      .values({ storeId: other, name: 'Private', permissions: {} })
      .returning({ id: roles.id });
    expect(await app.get(MembersRepository).find(storeId, foreign!.id)).toBeUndefined();
    expect((await request(`/members/${foreign!.id}`, {}, owner.cookie, 'DELETE')).statusCode).toBe(
      404,
    );
    expect(
      (await request(`/members/${foreign!.id}`, { builtInRole: 'admin' }, owner.cookie, 'PATCH'))
        .statusCode,
    ).toBe(404);
    expect(
      (await request('/members/invites', { phone: phone(), roleId: role!.id })).statusCode,
    ).toBe(404);
    expect(
      (await request(`/members/${own!.id}`, {}, owner.cookie, 'DELETE')).json().error.code,
    ).toBe('TEAM_ROLE_DENIED');
    expect(
      (await request(`/members/${own!.id}`, { builtInRole: 'admin' }, owner.cookie, 'PATCH'))
        .statusCode,
    ).toBe(403);
    expect(
      (await request('/members/invites', { phone: phone(), builtInRole: 'owner' })).statusCode,
    ).toBe(403);
  });
  it('rejects wrong and unverified recipients, cancelled tokens, and expired tokens', async () => {
    const target = phone();
    const response = await invite(target);
    const token = tokenFor(target);
    expect((await request('/invites/accept', { token }, member.cookie)).json().error.code).toBe(
      'INVITE_WRONG_ACCOUNT',
    );
    await admin.db
      .update(users)
      .set({ phone: target, phoneVerifiedAt: null })
      .where(eq(users.id, member.id));
    expect((await request('/invites/accept', { token }, member.cookie)).json().error.code).toBe(
      'INVITE_WRONG_ACCOUNT',
    );
    await admin.db
      .update(memberships)
      .set({ inviteExpiresAt: new Date(Date.now() - 1) })
      .where(eq(memberships.id, response.json().id));
    expect((await request('/invites/accept', { token }, member.cookie)).json().error.code).toBe(
      'INVITE_INVALID',
    );
    await request(`/members/${response.json().id}`, {}, owner.cookie, 'DELETE');
    const [removed] = await admin.db
      .select()
      .from(memberships)
      .where(eq(memberships.id, response.json().id));
    expect(removed).toMatchObject({
      status: 'removed',
      inviteTokenHash: null,
      inviteExpiresAt: null,
    });
    expect(removed!.removedAt).toBeInstanceOf(Date);
    expect((await request('/invites/accept', { token }, member.cookie)).statusCode).toBe(400);
    await admin.db
      .update(users)
      .set({ phone: member.phone, phoneVerifiedAt: new Date() })
      .where(eq(users.id, member.id));
  });
  it('rotates resend tokens, refuses to revive an expired invite into a full store, and respects cooldown', async () => {
    const target = phone();
    const response = await invite(target);
    const id = response.json().id;
    const oldToken = tokenFor(target);
    expect((await request(`/members/invites/${id}/resend`, {})).statusCode).toBe(429);
    const reserve = vi.spyOn(app.get(InviteDelivery), 'reserve').mockResolvedValue();
    try {
      expect((await request(`/members/invites/${id}/resend`, {})).statusCode).toBe(200);
      expect(tokenFor(target)).not.toBe(oldToken);
      expect(
        (await request('/invites/accept', { token: oldToken }, member.cookie)).statusCode,
      ).toBe(400);
      await admin.db
        .update(memberships)
        .set({ inviteExpiresAt: new Date(Date.now() - 1) })
        .where(eq(memberships.id, id));
      const another = await invite();
      expect(another.statusCode).toBe(201);
      expect((await request(`/members/invites/${id}/resend`, {})).json().error.code).toBe(
        'TEAM_SEATS_FULL',
      );
      await request(`/members/${another.json().id}`, {}, owner.cookie, 'DELETE');
      expect((await request(`/members/invites/${id}/resend`, {})).statusCode).toBe(200);
    } finally {
      reserve.mockRestore();
    }
    await request(`/members/${id}`, {}, owner.cookie, 'DELETE');
  });
  it('reads role changes on the next request and never overwrites an existing active member', async () => {
    const target = await account();
    const response = await invite(target.phone);
    expect(
      (await request('/invites/accept', { token: tokenFor(target.phone) }, target.cookie))
        .statusCode,
    ).toBe(200);
    await request('/me/active-store', { storeId }, target.cookie);
    expect(
      (await app.inject({ url: '/members', headers: { cookie: target.cookie } })).statusCode,
    ).toBe(403);
    const changed = await request(
      `/members/${response.json().id}`,
      { builtInRole: 'admin' },
      owner.cookie,
      'PATCH',
    );
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({ name: 'রিনা', phone: target.phone });
    expect(
      (await app.inject({ url: '/members', headers: { cookie: target.cookie } })).statusCode,
    ).toBe(200);
    expect((await invite(target.phone)).json().error.code).toBe('MEMBER_ALREADY_ACTIVE');
    await request(`/members/${response.json().id}`, {}, owner.cookie, 'DELETE');
  });
  it('holds verified email identity stable until membership and audit commit', async () => {
    const target = await account();
    const email = `${randomUUID()}@example.test`;
    await admin.db
      .update(users)
      .set({ email: email.toUpperCase(), emailVerifiedAt: new Date() })
      .where(eq(users.id, target.id));
    const delivered: string[] = [];
    const send = vi.spyOn(app.get(EmailService), 'send').mockImplementation(async (message) => {
      delivered.push(message.text!);
    });
    const response = await request('/members/invites', { email, builtInRole: 'support_agent' });
    expect(response.statusCode).toBe(201);
    const token = delivered[0]!.match(/[a-f0-9]{64}/)![0];
    let release!: () => void;
    let locked!: () => void;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    const acquired = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const usersService = app.get(UsersService);
    const original = usersService.lockInviteIdentity.bind(usersService);
    const lock = vi
      .spyOn(usersService, 'lockInviteIdentity')
      .mockImplementationOnce(async (...args) => {
        const identity = await original(...args);
        locked();
        await paused;
        return identity;
      });
    const accepted = request('/invites/accept', { token }, target.cookie).then((result) => result);
    await acquired;
    const connection = await admin.pool.connect();
    try {
      await connection.query('begin');
      await connection.query("set local lock_timeout = '100ms'");
      await expect(
        connection.query('update users set email = $1 where id = $2', [
          `${randomUUID()}@example.test`,
          target.id,
        ]),
      ).rejects.toMatchObject({ code: '55P03' });
      await connection.query('rollback');
    } finally {
      connection.release();
      release();
      lock.mockRestore();
      send.mockRestore();
    }
    expect((await accepted).statusCode).toBe(200);
    await request(`/members/${response.json().id}`, {}, owner.cookie, 'DELETE');
  });
  it('paginates by creation time and id without losing sub-millisecond ties', async () => {
    const other = await shop();
    const ids = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'];
    await admin.db.insert(memberships).values(
      ids.map((id) => ({
        id,
        storeId: other,
        builtInRole: 'admin' as const,
        status: 'invited' as const,
        invitePhone: phone(),
      })),
    );
    await admin.pool.query(
      "update memberships set created_at = '2020-01-01 00:00:00.123456+00' where id = any($1::uuid[])",
      [ids],
    );
    const repository = app.get(MembersRepository);
    const first = await repository.list(other, { limit: 1 });
    expect(first.map((row) => row.id)).toEqual(ids);
    const second = await repository.list(other, { limit: 1, cursor: first[0]!.id });
    expect(second[0]!.id).toBe(ids[1]);
    expect(second[1]!.userId).toBe(owner.id);
    expect(await repository.list(storeId, { limit: 1, cursor: ids[0] })).toEqual([]);
  });
  it('assigns a custom role within the grant rule and masks list phones without the flag', async () => {
    const target = await account();
    const [role] = await admin.db
      .insert(roles)
      .values({ storeId, name: 'Team reader', permissions: { team: 'edit' } })
      .returning({ id: roles.id });
    const response = await request('/members/invites', { phone: target.phone, roleId: role!.id });
    expect(response.statusCode).toBe(201);
    await request('/invites/accept', { token: tokenFor(target.phone) }, target.cookie);
    await request('/me/active-store', { storeId }, target.cookie);
    const page = await app.inject({ url: '/members', headers: { cookie: target.cookie } });
    expect(page.statusCode).toBe(200);
    expect(page.json().items.find((row: { userId: string }) => row.userId === owner.id).phone).toBe(
      `${owner.phone.slice(0, 3)}XXXXX${owner.phone.slice(-3)}`,
    );
    expect(
      (
        await request('/members/invites', { phone: phone(), builtInRole: 'admin' }, target.cookie)
      ).json().error.code,
    ).toBe('TEAM_ROLE_DENIED');
    await request(`/members/${response.json().id}`, {}, owner.cookie, 'DELETE');
  });
  it('never downgrades an active member when another valid invite targets that account', async () => {
    const target = await account();
    const invitation = await invite(target.phone);
    const [active] = await admin.db
      .insert(memberships)
      .values({ storeId, userId: target.id, builtInRole: 'admin', status: 'active' })
      .returning({ id: memberships.id });
    const response = await request(
      '/invites/accept',
      { token: tokenFor(target.phone) },
      target.cookie,
    );
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('MEMBER_ALREADY_ACTIVE');
    expect(await app.get(MembersRepository).find(storeId, active!.id)).toMatchObject({
      status: 'active',
      builtInRole: 'admin',
    });
    await request(`/members/${active!.id}`, {}, owner.cookie, 'DELETE');
    await request(`/members/${invitation.json().id}`, {}, owner.cookie, 'DELETE');
  });
  it('restores a removed membership on re-invitation and rolls acceptance back with audit failure', async () => {
    const target = await account();
    const [removed] = await admin.db
      .insert(memberships)
      .values({
        storeId,
        userId: target.id,
        builtInRole: 'admin',
        status: 'removed',
        removedAt: new Date(),
      })
      .returning({ id: memberships.id });
    const invitation = await invite(target.phone);
    const token = tokenFor(target.phone);
    const audit = vi
      .spyOn(app.get(AuditService), 'record')
      .mockRejectedValueOnce(new Error('audit unavailable'));
    expect((await request('/invites/accept', { token }, target.cookie)).statusCode).toBe(500);
    audit.mockRestore();
    expect(await app.get(MembersRepository).find(storeId, removed!.id)).toMatchObject({
      status: 'removed',
    });
    expect(await app.get(MembersRepository).find(storeId, invitation.json().id)).toMatchObject({
      status: 'invited',
    });
    const response = await request('/invites/accept', { token }, target.cookie);
    expect(response.statusCode).toBe(200);
    expect(response.json().membershipId).toBe(removed!.id);
    expect(await app.get(MembersRepository).find(storeId, removed!.id)).toMatchObject({
      status: 'active',
      builtInRole: 'support_agent',
    });
    await request(`/members/${removed!.id}`, {}, owner.cookie, 'DELETE');
  });
  it('rejects unverified email even when its text matches and accepts the verified recipient instead', async () => {
    const email = `${randomUUID()}@example.test`;
    const unverified = await account();
    const verified = await account();
    await admin.db
      .update(users)
      .set({ email, emailVerifiedAt: null })
      .where(eq(users.id, unverified.id));
    await admin.db
      .update(users)
      .set({ email, emailVerifiedAt: new Date() })
      .where(eq(users.id, verified.id));
    let delivered = '';
    const send = vi.spyOn(app.get(EmailService), 'send').mockImplementation(async (message) => {
      delivered = message.text!;
    });
    const invitation = await request('/members/invites', { email, builtInRole: 'support_agent' });
    send.mockRestore();
    expect(invitation.statusCode).toBe(201);
    const token = delivered.match(/[a-f0-9]{64}/)![0];
    expect((await request('/invites/accept', { token }, unverified.cookie)).json().error.code).toBe(
      'INVITE_WRONG_ACCOUNT',
    );
    expect((await request('/invites/accept', { token }, verified.cookie)).statusCode).toBe(200);
    await request(`/members/${invitation.json().id}`, {}, owner.cookie, 'DELETE');
  });
});
