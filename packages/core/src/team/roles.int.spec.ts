import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { users } from '@dakly/db/schema/auth';
import { plans, subscriptions } from '@dakly/db/schema/billing';
import { stores } from '@dakly/db/schema/stores';
import { memberships, roles } from '@dakly/db/schema/team';

import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../platform/database/database.module';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { registerSessionCookies } from '../platform/http/session-cookie';
import { SessionsService } from '../sessions/sessions.service';
import { RolesRepository } from './roles.repository';

class TestModule {}
Module({ imports: [DatabaseModule, AuthModule] })(TestModule);

describe('custom roles over Fastify and Postgres', () => {
  const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
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
  const permissions = {
    areas: { team: 'view' },
    seeFullPhone: false,
    exportLists: false,
    refund: false,
  };
  const create = (name = randomUUID(), cookie = owner.cookie) =>
    request('/roles', { name, permissions }, cookie);
  const list = (cookie = owner.cookie, query = '') =>
    app.inject({ url: `/roles${query}`, headers: { cookie } });
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
    await admin.db
      .insert(memberships)
      .values({ storeId, userId: member.id, builtInRole: 'admin', status: 'active' });
    await request('/me/active-store', { storeId }, member.cookie);
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
  it('creates, renames and deletes roles with atomic audit records', async () => {
    const created = await create();
    expect(created.statusCode).toBe(201);
    const role = created.json();
    expect(role.permissions).toEqual(permissions);
    const changed = await request(`/roles/${role.id}`, { name: 'Renamed' }, owner.cookie, 'PATCH');
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({ name: 'Renamed', permissions });
    expect((await request(`/roles/${role.id}`, {}, owner.cookie, 'DELETE')).statusCode).toBe(204);
    const audit = await admin.pool.query(
      'select action from audit_log where entity_id = $1 order by created_at, id',
      [role.id],
    );
    expect(audit.rows.map((row) => row.action)).toEqual([
      'role.created',
      'role.changed',
      'role.deleted',
    ]);
  });
  it('returns bounded custom pages and immutable built-in metadata', async () => {
    const ids = [(await create()).json().id, (await create()).json().id].sort();
    const first = await list(owner.cookie, '?limit=1');
    expect(first.statusCode).toBe(200);
    expect(first.json().items.map((row: { id: string }) => row.id)).toEqual([ids[0]]);
    expect(first.json().nextCursor).toBe(ids[0]);
    expect(first.json().builtInRoles).toHaveLength(4);
    expect(
      first
        .json()
        .builtInRoles.find((role: { builtInRole: string }) => role.builtInRole === 'admin')
        .permissions.areas.billing,
    ).toBe('view');
    const second = await list(owner.cookie, `?limit=1&cursor=${ids[0]}`);
    expect(second.json().items.map((row: { id: string }) => row.id)).toEqual([ids[1]]);
    expect(second.json().nextCursor).toBeNull();
    expect(
      (await request('/roles/owner', { name: 'Changed' }, owner.cookie, 'PATCH')).statusCode,
    ).toBe(400);
    expect((await list(owner.cookie, '?limit=101')).statusCode).toBe(400);
    for (const id of ids) await request(`/roles/${id}`, {}, owner.cookie, 'DELETE');
  });
  it('lists a stored role with permission keys the contract no longer knows', async () => {
    const [role] = await admin.db
      .insert(roles)
      .values({
        storeId,
        name: randomUUID(),
        permissions: { team: 'view', retiredArea: 'edit', orders: 'manage' },
        canSeeFullPhone: true,
      })
      .returning({ id: roles.id });
    const listed = await list(owner.cookie, '?limit=100');
    expect(listed.statusCode, listed.body).toBe(200);
    expect(
      listed.json().items.find((row: { id: string }) => row.id === role!.id).permissions,
    ).toEqual({ areas: { team: 'view' }, seeFullPhone: true, exportLists: false, refund: false });
    await request(`/roles/${role!.id}`, {}, owner.cookie, 'DELETE');
  });
  it('hides foreign roles from listing, editing and deletion', async () => {
    const other = await shop();
    const [foreign] = await admin.db
      .insert(roles)
      .values({ storeId: other, name: 'Private', permissions: {} })
      .returning({ id: roles.id });
    expect((await list()).json().items).toEqual([]);
    const repository = app.get(RolesRepository);
    expect(await repository.find(storeId, foreign!.id)).toBeUndefined();
    expect(
      await repository.change(
        storeId,
        foreign!.id,
        { name: 'Wrong store', permissions },
        new Date(),
      ),
    ).toBeUndefined();
    await repository.remove(storeId, foreign!.id);
    for (const method of ['PATCH', 'DELETE'] as const) {
      const response = await request(
        `/roles/${foreign!.id}`,
        { name: 'Changed' },
        owner.cookie,
        method,
      );
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('ROLE_NOT_FOUND');
    }
    expect((await list(owner.cookie, `?cursor=${foreign!.id}`)).json().items).toEqual([]);
    expect(
      await admin.db.select({ name: roles.name }).from(roles).where(eq(roles.id, foreign!.id)),
    ).toEqual([{ name: 'Private' }]);
  });
  it('rejects billing edit creation and self-assignment of Owner powers', async () => {
    expect(
      (
        await request(
          '/roles',
          { name: 'Forbidden', permissions: { ...permissions, areas: { billing: 'edit' } } },
          member.cookie,
        )
      ).statusCode,
    ).toBe(400);
    const [forbidden] = await admin.db
      .insert(roles)
      .values({ storeId, name: 'Legacy invalid role', permissions: { billing: 'edit' } })
      .returning({ id: roles.id });
    const [membership] = await admin.db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.storeId, storeId), eq(memberships.userId, member.id)));
    for (const [payload, status, code] of [
      [{ roleId: forbidden!.id }, 404, 'ROLE_NOT_FOUND'],
      [{ builtInRole: 'owner' }, 403, 'TEAM_ROLE_DENIED'],
    ] as const) {
      const response = await request(`/members/${membership!.id}`, payload, member.cookie, 'PATCH');
      expect(response.statusCode).toBe(status);
      expect(response.json().error.code).toBe(code);
    }
    await admin.db.delete(roles).where(eq(roles.id, forbidden!.id));
    const harmless = (await create(randomUUID(), member.cookie)).json();
    expect(
      (await request(`/members/${membership!.id}`, { roleId: harmless.id }, member.cookie, 'PATCH'))
        .statusCode,
    ).toBe(200);
    expect((await list(member.cookie)).statusCode).toBe(200);
    await request(`/members/${membership!.id}`, { builtInRole: 'admin' }, owner.cookie, 'PATCH');
    await request(`/roles/${harmless.id}`, {}, owner.cookie, 'DELETE');
  });
  it('observes edited permissions on the next request and denies flags or areas the editor lacks', async () => {
    const role = (await create()).json();
    const target = await account();
    await admin.db
      .insert(memberships)
      .values({ storeId, userId: target.id, roleId: role.id, status: 'active' });
    await request('/me/active-store', { storeId }, target.cookie);
    expect((await list(target.cookie)).statusCode).toBe(200);
    expect((await create(randomUUID(), target.cookie)).statusCode).toBe(403);
    expect(
      (
        await request(
          `/roles/${role.id}`,
          { permissions: { ...permissions, areas: { team: 'edit' } } },
          owner.cookie,
          'PATCH',
        )
      ).statusCode,
    ).toBe(200);
    for (const flag of ['seeFullPhone', 'exportLists', 'refund']) {
      expect(
        (
          await request(
            '/roles',
            { name: randomUUID(), permissions: { ...permissions, [flag]: true } },
            target.cookie,
          )
        ).json().error.code,
      ).toBe('TEAM_ROLE_DENIED');
      expect(
        (
          await request(
            `/roles/${role.id}`,
            { permissions: { ...permissions, [flag]: true } },
            target.cookie,
            'PATCH',
          )
        ).json().error.code,
      ).toBe('TEAM_ROLE_DENIED');
    }
    expect(
      (
        await request(
          '/roles',
          { name: randomUUID(), permissions: { ...permissions, areas: { orders: 'edit' } } },
          target.cookie,
        )
      ).json().error.code,
    ).toBe('TEAM_ROLE_DENIED');
    await request(
      `/roles/${role.id}`,
      { permissions: { ...permissions, areas: {} } },
      owner.cookie,
      'PATCH',
    );
    expect((await list(target.cookie)).statusCode).toBe(403);
  });
  it.each(['active', 'invited', 'removed'] as const)(
    'rejects deleting roles referenced by %s memberships',
    async (status) => {
      const role = (await create()).json();
      const target = await account();
      await admin.db
        .insert(memberships)
        .values({ storeId, roleId: role.id, userId: target.id, status, invitePhone: target.phone });
      const response = await request(`/roles/${role.id}`, {}, owner.cookie, 'DELETE');
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('ROLE_IN_USE');
    },
  );
  it('returns name conflicts and rolls back every mutation on audit failure', async () => {
    const name = randomUUID();
    const role = (await create(name)).json();
    expect((await create(name)).json().error.code).toBe('ROLE_NAME_EXISTS');
    const other = (await create()).json();
    expect(
      (await request(`/roles/${other.id}`, { name }, owner.cookie, 'PATCH')).json().error.code,
    ).toBe('ROLE_NAME_EXISTS');
    const rejected = randomUUID();
    for (const [method, url, payload] of [
      ['POST', '/roles', { name: rejected, permissions }],
      ['PATCH', `/roles/${role.id}`, { name: rejected }],
      ['DELETE', `/roles/${role.id}`, {}],
    ] as const) {
      const auditService = app.get(AuditService);
      const record = auditService.record.bind(auditService);
      const audit = vi.spyOn(auditService, 'record').mockImplementationOnce(async (...args) => {
        await record(...args);
        throw new Error('audit unavailable');
      });
      expect((await request(url, payload, owner.cookie, method)).statusCode).toBe(500);
      audit.mockRestore();
    }
    expect(
      await admin.db.select({ name: roles.name }).from(roles).where(eq(roles.id, role.id)),
    ).toEqual([{ name }]);
    expect(
      await admin.db.select({ id: roles.id }).from(roles).where(eq(roles.name, rejected)),
    ).toEqual([]);
    const audit = await admin.pool.query('select action from audit_log where entity_id = $1', [
      role.id,
    ]);
    expect(audit.rows).toEqual([{ action: 'role.created' }]);
  });
  it('serializes role deletion with membership assignment', async () => {
    const role = (await create()).json();
    const [membership] = await admin.db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.storeId, storeId), eq(memberships.userId, member.id)));
    const auditService = app.get(AuditService);
    const record = auditService.record.bind(auditService);
    let release!: () => void;
    let entered!: () => void;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deleting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const audit = vi.spyOn(auditService, 'record').mockImplementationOnce(async (...args) => {
      await record(...args);
      entered();
      await paused;
    });
    const removed = request(`/roles/${role.id}`, {}, owner.cookie, 'DELETE').then(
      (result) => result,
    );
    await deleting;
    const assignment = request(
      `/members/${membership!.id}`,
      { roleId: role.id },
      owner.cookie,
      'PATCH',
    ).then((result) => result);
    try {
      const connection = await admin.pool.connect();
      try {
        await connection.query('begin');
        await expect(
          connection.query('select id from stores where id = $1 for no key update nowait', [
            storeId,
          ]),
        ).rejects.toMatchObject({ code: '55P03' });
      } finally {
        await connection.query('rollback');
        connection.release();
      }
    } finally {
      release();
      audit.mockRestore();
    }
    expect((await removed).statusCode).toBe(204);
    const response = await assignment;
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('ROLE_NOT_FOUND');
  });
});
