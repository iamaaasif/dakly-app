import 'reflect-metadata';
import { Controller, Get, Post, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { sessions, users } from '@dakly/db/schema/auth';
import { contacts } from '@dakly/db/schema/contacts';
import { stores } from '@dakly/db/schema/stores';
import { memberships, roles } from '@dakly/db/schema/team';

import { ContactsModule } from '../contacts/contacts.module';
import { DatabaseModule } from '../platform/database/database.module';
import { DATABASE_CONNECTION } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { registerSessionCookies } from '../platform/http/session-cookie';
import { Public } from '../platform/tenancy/access.decorators';
import { CurrentUser } from '../platform/tenancy/current-user.decorator';
import { TeamService } from '../team/team.service';
import { SessionsModule } from './sessions.module';
import { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

class PublicController {
  health() {
    return { status: 'ok' };
  }

  write() {
    return { changed: false };
  }

  user(userId: string) {
    return userId;
  }
}
Controller('public')(PublicController);
Public()(PublicController);
for (const method of ['health', 'user'] as const) {
  Get(method)(
    PublicController.prototype,
    method,
    Object.getOwnPropertyDescriptor(PublicController.prototype, method)!,
  );
}
Post('write')(
  PublicController.prototype,
  'write',
  Object.getOwnPropertyDescriptor(PublicController.prototype, 'write')!,
);
CurrentUser()(PublicController.prototype, 'user', 0);
class TestModule {}
Module({
  imports: [DatabaseModule, SessionsModule, ContactsModule],
  controllers: [PublicController],
})(TestModule);

describe('Session boundary over Fastify and Postgres', () => {
  const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
  let app: NestFastifyApplication;
  let service: SessionsService;
  let team: TeamService;
  let repository: SessionsRepository;
  let userId: string;
  let storeId: string;
  let otherStoreId: string;
  let customerId: string;
  let otherCustomerId: string;
  let token: string;
  let sessionId: string;
  const queries: string[] = [];
  const origin = 'http://localhost:3000';
  const cookie = () => `dakly_session=${token}`;
  const getCustomer = () =>
    app.inject({ url: `/contacts/${customerId}`, headers: { cookie: cookie() } });

  beforeAll(async () => {
    process.env.WEB_ORIGINS = origin;
    app = await NestFactory.create<NestFastifyApplication>(TestModule, new FastifyAdapter(), {
      logger: false,
    });
    const connection: ReturnType<typeof createDatabase> = app.get(DATABASE_CONNECTION);
    connection.pool.on('connect', (client) => {
      const query = client.query.bind(client);
      vi.spyOn(client, 'query').mockImplementation((...args: Parameters<typeof client.query>) => {
        const value = args[0];
        queries.push(typeof value === 'string' ? value : value.text);
        return query(...args);
      });
    });
    await registerSessionCookies(app);
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    service = app.get(SessionsService);
    team = app.get(TeamService);
    repository = app.get(SessionsRepository);
    const [user] = await admin.db
      .insert(users)
      .values({
        name: 'Rina',
        email: `${crypto.randomUUID()}@example.test`,
        passwordHash: 'never-return-this',
      })
      .returning({ id: users.id });
    userId = user!.id;
    const shops = await admin.db
      .insert(stores)
      .values([{ name: 'Rina shop' }, { name: 'Other shop' }])
      .returning({ id: stores.id });
    storeId = shops[0]!.id;
    otherStoreId = shops[1]!.id;
    await admin.db.insert(memberships).values(
      [storeId, otherStoreId].map((id) => ({
        storeId: id,
        userId,
        builtInRole: 'support_agent' as const,
        status: 'active' as const,
      })),
    );
    const [customer] = await admin.db
      .insert(contacts)
      .values({ storeId, name: 'Karim', phone: '01712345678', source: 'manual', kind: 'customer' })
      .returning({ id: contacts.id });
    customerId = customer!.id;
    const [otherCustomer] = await admin.db
      .insert(contacts)
      .values({
        storeId: otherStoreId,
        name: 'Sumi',
        phone: '01912345678',
        source: 'manual',
        kind: 'customer',
      })
      .returning({ id: contacts.id });
    otherCustomerId = otherCustomer!.id;
    const created = await service.create(userId, { isRemembered: true });
    token = created.token;
    sessionId = created.session.id;
    await service.setActiveStore(userId, sessionId, storeId);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await app?.close();
    await admin.db.execute(sql`delete from account_security_events where user_id = ${userId}`);
    await admin.db.execute(
      sql`delete from outbox_events where store_id in (${storeId}, ${otherStoreId})`,
    );
    await admin.db
      .delete(memberships)
      .where(sql`${memberships.storeId} in (${storeId}, ${otherStoreId})`);
    await admin.db.delete(users).where(eq(users.id, userId));
    await admin.db.delete(roles).where(eq(roles.storeId, storeId));
    await admin.db
      .delete(contacts)
      .where(sql`${contacts.storeId} in (${storeId}, ${otherStoreId})`);
    await admin.db.delete(stores).where(sql`${stores.id} in (${storeId}, ${otherStoreId})`);
    await admin.pool.end();
  });

  it('keeps public health reachable and CurrentUser fails without a verified user', async () => {
    expect((await app.inject('/public/health')).statusCode).toBe(200);
    const user = await app.inject(`/public/user?userId=${userId}`);
    expect(user.statusCode).toBe(401);
    expect(user.json().error.code).toBe('AUTH_REQUIRED');
  });

  it.each([undefined, 'unknown'])('returns route-specific 401 for cookie %s', async (value) => {
    const headers = value ? { cookie: `dakly_session=${value}` } : {};
    const account = await app.inject({ url: '/me', headers });
    expect(account.statusCode).toBe(401);
    expect(account.json().error.code).toBe('AUTH_REQUIRED');
    const store = await app.inject({ url: `/contacts/${customerId}`, headers });
    expect(store.statusCode).toBe(401);
    expect(store.json().error.code).toBe('STORE_REQUIRED');
  });
  it('returns only safe user fields, lists active stores and masks Support phone numbers', async () => {
    const me = await app.inject({ url: '/me', headers: { cookie: cookie() } });
    expect(me.statusCode).toBe(200);
    expect(Object.keys(me.json()).sort()).toEqual([
      'email',
      'hasPassword',
      'id',
      'isEmailVerified',
      'isPhoneVerified',
      'isTotpEnabled',
      'name',
      'phone',
    ]);
    const shops = await app.inject({ url: '/me/stores', headers: { cookie: cookie() } });
    expect(shops.json().items).toHaveLength(2);
    const customer = await getCustomer();
    expect(customer.statusCode).toBe(200);
    expect(customer.json().phone).toBe('01712-XXX678');
  });
  it('keeps selected metadata independent of bounded membership pages and rechecks removal', async () => {
    const extra = Array.from({ length: 55 }, () => crypto.randomUUID()).sort();
    const selected = extra.at(-1)!;
    const created = await service.create(userId, { isRemembered: false });
    const headers = { cookie: `dakly_session=${created.token}` };
    try {
      await admin.pool.query(
        "insert into stores(id,name) select id,'Paged shop' from unnest($1::uuid[]) id",
        [extra],
      );
      await admin.pool.query(
        "insert into memberships(id,store_id,user_id,built_in_role,status) select gen_random_uuid(),id,$2,'admin','active' from unnest($1::uuid[]) id",
        [extra, userId],
      );
      await service.setActiveStore(userId, created.session.id, selected);
      const context = (await app.inject({ url: '/me/context', headers })).json();
      expect(context.stores).toBeUndefined();
      expect(context.hasMemberships).toBe(true);
      expect(context.currentStore.storeId).toBe(selected);
      const first = (await app.inject({ url: '/me/stores?limit=10', headers })).json();
      expect(first.items).toHaveLength(10);
      expect(first.items.some((shop: { storeId: string }) => shop.storeId === selected)).toBe(
        false,
      );
      const second = (
        await app.inject({ url: `/me/stores?limit=50&after=${first.nextCursor}`, headers })
      ).json();
      expect(second.items).toHaveLength(47);
      expect(second.nextCursor).toBeNull();
      expect(new Set([...first.items, ...second.items].map((shop) => shop.storeId)).size).toBe(57);
      expect((await app.inject({ url: '/me/stores?limit=51', headers })).statusCode).toBe(400);
      await admin.pool.query(
        "update memberships set status='removed' where store_id=$1 and user_id=$2",
        [selected, userId],
      );
      expect((await app.inject({ url: '/me/context', headers })).json().currentStore).toBeNull();
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/me/active-store',
            headers: { ...headers, origin },
            payload: { storeId: selected },
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/me/active-store',
            headers: { ...headers, origin },
            payload: { storeId },
          })
        ).statusCode,
      ).toBe(204);
    } finally {
      await admin.pool.query('delete from sessions where id=$1', [created.session.id]);
      await admin.pool.query('delete from memberships where store_id=any($1::uuid[])', [extra]);
      await admin.pool.query('delete from stores where id=any($1::uuid[])', [extra]);
    }
  });

  it('returns verified shell context and rejects stale store preconditions before writes', async () => {
    const context = await app.inject({ url: '/me/context', headers: { cookie: cookie() } });
    expect(context.statusCode).toBe(200);
    const shell = context.json();
    expect(shell.user).toEqual({ id: userId, name: 'Rina' });
    expect(shell.hasMemberships).toBe(true);
    expect(shell.currentStore).toEqual({
      storeId,
      name: 'Rina shop',
      canViewCustomers: true,
      canCreateCustomer: false,
      canViewOrders: true,
      canViewProducts: true,
      canEditProducts: false,
      canViewCampaigns: false,
      canEditCampaigns: false,
      canViewSegments: true,
      canEditSegments: false,
      canApproveSupport: false,
      canViewTeam: false,
      canEditTeam: false,
      canTransferOwnership: false,
      canViewStoreSettings: false,
      canEditStoreSettings: false,
      canChangeExtensions: false,
    });
    expect(shell.contextTag).toMatch(/^[a-f0-9]{64}$/);
    expect(context.headers['cache-control']).toBe('no-store');
    await service.setActiveStore(userId, sessionId, otherStoreId);
    const rejected = await app.inject({
      method: 'POST',
      url: '/contacts',
      headers: { cookie: cookie(), origin, 'x-session-context': shell.contextTag },
      payload: { name: 'Must not be created', phone: '01855555555' },
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe('SESSION_CONTEXT_CHANGED');
    const rows = await admin.db.select().from(contacts).where(eq(contacts.phone, '01855555555'));
    expect(rows).toHaveLength(0);
    const changed = await app.inject({ url: '/me/context', headers: { cookie: cookie() } });
    expect(changed.json().currentStore.storeId).toBe(otherStoreId);
    expect(changed.json().contextTag).not.toBe(shell.contextTag);
    const staleSelection = await app.inject({
      method: 'POST',
      url: '/me/active-store',
      headers: { cookie: cookie(), origin, 'x-session-context': shell.contextTag },
      payload: { storeId },
    });
    expect(staleSelection.statusCode).toBe(409);
    expect((await service.resolve(token))?.activeStoreId).toBe(otherStoreId);

    await service.setActiveStore(userId, sessionId, storeId);
  });
  it.each([false, true])(
    'rejects an old account tag before revoking another account devices (selected store: %s)',
    async (selected) => {
      const [other] = await admin.db
        .insert(users)
        .values({ name: 'Account boundary', email: crypto.randomUUID() + '@example.test' })
        .returning({ id: users.id });
      const secondId = other!.id;
      try {
        const current = await service.create(secondId, { isRemembered: false });
        const another = await service.create(secondId, { isRemembered: false });
        if (selected) {
          await admin.db
            .insert(memberships)
            .values({ userId: secondId, storeId, builtInRole: 'support_agent', status: 'active' });
          await service.setActiveStore(secondId, current.session.id, storeId);
        }
        const headers = { cookie: `dakly_session=${current.token}`, origin };
        const staleTag = (
          await app.inject({ url: '/me/context', headers: { cookie: cookie() } })
        ).json().contextTag;
        const context = (await app.inject({ url: '/me/context', headers })).json();
        expect(context.currentStore?.storeId ?? null).toBe(selected ? storeId : null);
        const read = await app.inject({
          url: '/me',
          headers: { ...headers, 'x-session-context': staleTag },
        });
        expect(read.statusCode).toBe(200);
        expect(read.headers['x-session-context']).toBe(context.contextTag);
        const [before] = await admin.db.select().from(users).where(eq(users.id, secondId));
        const rejected = await app.inject({
          method: 'POST',
          url: '/me/sessions/sign-out-others',
          headers: { ...headers, 'x-session-context': staleTag },
        });
        expect(rejected.statusCode).toBe(409);
        expect(rejected.json().error.code).toBe('SESSION_CONTEXT_CHANGED');
        expect(await service.resolve(another.token)).toBeDefined();
        const [after] = await admin.db.select().from(users).where(eq(users.id, secondId));
        expect(after).toEqual(before);
        const events = await admin.db.execute(
          sql`select id from account_security_events where user_id = ${secondId}`,
        );
        expect(events.rows).toHaveLength(0);
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/me/sessions/sign-out-others',
              headers: { ...headers, 'x-session-context': context.contextTag },
            })
          ).statusCode,
        ).toBe(204);
        expect(await service.resolve(another.token)).toBeUndefined();
        const legacy = await service.create(secondId, { isRemembered: false });
        expect(
          (await app.inject({ method: 'POST', url: '/me/sessions/sign-out-others', headers }))
            .statusCode,
        ).toBe(204);
        expect(await service.resolve(legacy.token)).toBeUndefined();
        expect(
          (
            await app.inject({
              url: '/public/health',
              headers: { ...headers, 'x-session-context': staleTag },
            })
          ).statusCode,
        ).toBe(200);
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/public/write',
              headers: { ...headers, 'x-session-context': staleTag },
            })
          ).statusCode,
        ).toBe(201);
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/auth/sign-out',
              headers: { ...headers, 'x-session-context': staleTag },
            })
          ).statusCode,
        ).toBe(204);
        expect(await service.resolve(current.token)).toBeUndefined();
      } finally {
        await admin.db.execute(
          sql`delete from account_security_events where user_id = ${secondId}`,
        );
        await admin.db.delete(memberships).where(eq(memberships.userId, secondId));
        await admin.db.delete(users).where(eq(users.id, secondId));
      }
    },
  );
  it('keeps account-only context usable and drops selected access after removal', async () => {
    const created = await service.create(userId, { isRemembered: false });
    const headers = { cookie: `dakly_session=${created.token}` };
    const account = await app.inject({ url: '/me/context', headers });
    expect(account.statusCode).toBe(200);
    expect(account.json().currentStore).toBeNull();
    expect(account.json().hasMemberships).toBe(true);
    await service.setActiveStore(userId, created.session.id, storeId);
    const selected = await app.inject({ url: '/me/context', headers });
    await admin.db
      .update(memberships)
      .set({ status: 'removed' })
      .where(eq(memberships.storeId, storeId));
    try {
      const revoked = await app.inject({ url: '/me/context', headers });
      expect(revoked.statusCode).toBe(200);
      expect(revoked.json().currentStore).toBeNull();
      expect(revoked.json().hasMemberships).toBe(true);
      expect(revoked.json().contextTag).not.toBe(selected.json().contextTag);
      expect((await app.inject({ url: '/me', headers })).statusCode).toBe(200);
    } finally {
      await admin.db
        .update(memberships)
        .set({ status: 'active' })
        .where(eq(memberships.storeId, storeId));
    }
  });
  it('changes the shell context tag after a same-store permission change', async () => {
    const headers = { cookie: cookie() };
    const initial = (await app.inject({ url: '/me/context', headers })).json();
    await admin.db
      .update(memberships)
      .set({ builtInRole: 'owner' })
      .where(eq(memberships.storeId, storeId));
    try {
      const changed = (await app.inject({ url: '/me/context', headers })).json();
      expect(changed.contextTag).not.toBe(initial.contextTag);
      expect(changed.currentStore.canApproveSupport).toBe(true);
      expect(changed.currentStore.canViewTeam).toBe(true);
      expect(changed.currentStore.canEditTeam).toBe(true);
      expect(changed.currentStore.canTransferOwnership).toBe(true);
      expect(changed.currentStore.canCreateCustomer).toBe(true);
      expect(changed.currentStore.canViewStoreSettings).toBe(true);
      expect(changed.currentStore.canEditStoreSettings).toBe(true);
      expect(changed.currentStore.canChangeExtensions).toBe(true);
    } finally {
      await admin.db
        .update(memberships)
        .set({ builtInRole: 'support_agent' })
        .where(eq(memberships.storeId, storeId));
    }
  });
  it('derives live product view and edit capabilities from the current role', async () => {
    const [role] = await admin.db
      .insert(roles)
      .values({
        storeId,
        name: 'Product context',
        permissions: {},
      })
      .returning({ id: roles.id });
    await admin.db
      .update(memberships)
      .set({ builtInRole: null, roleId: role!.id })
      .where(eq(memberships.storeId, storeId));
    try {
      for (const level of ['none', 'view', 'edit'] as const) {
        await admin.db
          .update(roles)
          .set({ permissions: { products: level, campaigns: level } })
          .where(eq(roles.id, role!.id));
        const context = (
          await app.inject({ url: '/me/context', headers: { cookie: cookie() } })
        ).json();
        expect(context.currentStore).toMatchObject({
          canViewProducts: level !== 'none',
          canEditProducts: level === 'edit',
          canViewCampaigns: level !== 'none',
          canEditCampaigns: level === 'edit',
        });
      }
    } finally {
      await admin.db
        .update(memberships)
        .set({ builtInRole: 'support_agent', roleId: null })
        .where(eq(memberships.storeId, storeId));
      await admin.db.delete(roles).where(eq(roles.id, role!.id));
    }
  });
  it('derives Team capabilities from fresh custom grants without granting ownership', async () => {
    const [role] = await admin.db
      .insert(roles)
      .values({
        storeId,
        name: 'Team context reader',
        permissions: { team: 'view', storeSettings: 'view' },
      })
      .returning({ id: roles.id });
    await admin.db
      .update(memberships)
      .set({ builtInRole: null, roleId: role!.id })
      .where(eq(memberships.storeId, storeId));
    try {
      const headers = { cookie: cookie() };
      const before = (await app.inject({ url: '/me/context', headers })).json();
      expect(before.currentStore).toMatchObject({
        canViewStoreSettings: true,
        canEditStoreSettings: false,
        canChangeExtensions: false,
        canViewTeam: true,
        canEditTeam: false,
        canTransferOwnership: false,
      });
      await admin.db
        .update(roles)
        .set({ permissions: { team: 'edit', storeSettings: 'edit' } })
        .where(eq(roles.id, role!.id));
      const after = (await app.inject({ url: '/me/context', headers })).json();
      expect(after.currentStore).toMatchObject({
        canViewStoreSettings: true,
        canEditStoreSettings: true,
        canChangeExtensions: false,
        canViewTeam: true,
        canEditTeam: true,
        canTransferOwnership: false,
      });
      expect(after.contextTag).not.toBe(before.contextTag);
      const stale = await app.inject({
        method: 'POST',
        url: '/contacts',
        headers: { ...headers, origin, 'x-session-context': before.contextTag },
        payload: { name: 'Must not be created', phone: '01855555555' },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().error.code).toBe('SESSION_CONTEXT_CHANGED');
    } finally {
      await admin.db
        .update(memberships)
        .set({ builtInRole: 'support_agent', roleId: null })
        .where(eq(memberships.storeId, storeId));
      await admin.db.delete(roles).where(eq(roles.id, role!.id));
    }
  });
  it.each([undefined, 'https://elsewhere.test'])(
    'rejects a browser write with origin %s',
    async (value) => {
      const headers = { cookie: cookie(), ...(value ? { origin: value } : {}) };
      const response = await app.inject({
        method: 'POST',
        url: '/me/active-store',
        headers,
        payload: { storeId },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('ORIGIN_REJECTED');
    },
  );
  it('returns the same 404 for a nonmember store and a missing store', async () => {
    const [foreign] = await admin.db
      .insert(stores)
      .values({ name: 'Not a member' })
      .returning({ id: stores.id });
    const request = (id: string) =>
      app.inject({
        method: 'POST',
        url: '/me/active-store',
        headers: { cookie: cookie(), origin },
        payload: { storeId: id },
      });
    const foreignResponse = await request(foreign!.id);
    const missingResponse = await request(crypto.randomUUID());
    expect(foreignResponse.statusCode).toBe(404);
    expect(missingResponse.json()).toEqual(foreignResponse.json());
    await admin.db.delete(stores).where(eq(stores.id, foreign!.id));
  });
  it('does not reuse a paused membership read after removal on later requests', async () => {
    const original = team.accessFor.bind(team);
    const pause = deferred();
    const read = deferred();
    const spy = vi.spyOn(team, 'accessFor').mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      read.resolve();
      await pause.promise;
      return result;
    });
    const pending = getCustomer();
    await read.promise;
    await admin.db
      .update(memberships)
      .set({ status: 'removed' })
      .where(eq(memberships.storeId, storeId));
    pause.resolve();
    expect((await pending).statusCode).toBe(200);
    spy.mockRestore();
    expect((await getCustomer()).statusCode).toBe(401);
    const switched = await app.inject({
      method: 'POST',
      url: '/me/active-store',
      headers: { cookie: cookie(), origin },
      payload: { storeId: otherStoreId },
    });
    expect(switched.statusCode).toBe(204);
    expect(
      (await app.inject({ url: `/contacts/${otherCustomerId}`, headers: { cookie: cookie() } }))
        .statusCode,
    ).toBe(200);
    const foreignCustomer = await getCustomer();
    const missingCustomer = await app.inject({
      url: `/contacts/${crypto.randomUUID()}`,
      headers: { cookie: cookie() },
    });
    expect(foreignCustomer.statusCode).toBe(404);
    expect(foreignCustomer.json()).toEqual(missingCustomer.json());
    expect((await app.inject({ url: '/me', headers: { cookie: cookie() } })).statusCode).toBe(200);
    await admin.db
      .update(memberships)
      .set({ status: 'active' })
      .where(eq(memberships.storeId, storeId));
    await service.setActiveStore(userId, sessionId, storeId);
  });
  it('reads session and membership once regardless of the role area count', async () => {
    for (const builtInRole of ['support_agent', 'admin'] as const) {
      await admin.db
        .update(memberships)
        .set({ builtInRole })
        .where(eq(memberships.storeId, storeId));
      queries.length = 0;
      expect((await getCustomer()).statusCode).toBe(200);
      const accessReads = queries.filter(
        (query) => query.startsWith('select ') && /from "(sessions|memberships)"/.test(query),
      );
      expect(accessReads).toHaveLength(2);
    }
  });
  it('does not reuse a paused built-in role grant after a downgrade', async () => {
    await admin.db
      .update(memberships)
      .set({ builtInRole: 'admin' })
      .where(eq(memberships.storeId, storeId));
    const original = team.accessFor.bind(team);
    const read = deferred();
    const pause = deferred();
    const spy = vi.spyOn(team, 'accessFor').mockImplementationOnce(async (...args) => {
      const access = await original(...args);
      read.resolve();
      await pause.promise;
      return access;
    });
    const create = () =>
      app.inject({
        method: 'POST',
        url: '/contacts',
        headers: { cookie: cookie(), origin },
        payload: { name: 'New customer', phone: '01812345678' },
      });
    const pending = create();
    await read.promise;
    await admin.db
      .update(memberships)
      .set({ builtInRole: 'support_agent' })
      .where(eq(memberships.storeId, storeId));
    pause.resolve();
    expect((await pending).statusCode).toBe(201);
    spy.mockRestore();
    expect((await create()).statusCode).toBe(403);
  });
  it('applies a shared custom role downgrade to both members after a paused check', async () => {
    const [role] = await admin.db
      .insert(roles)
      .values({ storeId, name: 'Shared', permissions: { customers: 'view' } })
      .returning({ id: roles.id });
    const [second] = await admin.db
      .insert(users)
      .values({ name: 'Rahim', email: `${crypto.randomUUID()}@example.test` })
      .returning({ id: users.id });
    await admin.db
      .update(memberships)
      .set({ builtInRole: null, roleId: role!.id })
      .where(eq(memberships.storeId, storeId));
    await admin.db
      .insert(memberships)
      .values({ userId: second!.id, storeId, status: 'active', roleId: role!.id });
    const secondSession = await service.create(second!.id, { isRemembered: false });
    await service.setActiveStore(second!.id, secondSession.session.id, storeId);
    const original = team.accessFor.bind(team);
    const read = deferred();
    const pause = deferred();
    const spy = vi.spyOn(team, 'accessFor').mockImplementationOnce(async (...args) => {
      const access = await original(...args);
      read.resolve();
      await pause.promise;
      return access;
    });
    const pending = getCustomer();
    await read.promise;
    await admin.db
      .update(roles)
      .set({ permissions: { customers: 'none' } })
      .where(eq(roles.id, role!.id));
    pause.resolve();
    expect((await pending).statusCode).toBe(200);
    spy.mockRestore();
    expect((await getCustomer()).statusCode).toBe(403);
    expect(
      (
        await app.inject({
          url: `/contacts/${customerId}`,
          headers: { cookie: `dakly_session=${secondSession.token}` },
        })
      ).statusCode,
    ).toBe(403);
    await admin.db.delete(memberships).where(eq(memberships.userId, second!.id));
    await admin.db.delete(users).where(eq(users.id, second!.id));
    await admin.db
      .update(memberships)
      .set({ roleId: null, builtInRole: 'support_agent' })
      .where(eq(memberships.storeId, storeId));
  });
  it('rejects database failures instead of retaining earlier account or store access', async () => {
    expect((await getCustomer()).statusCode).toBe(200);
    const lookup = vi
      .spyOn(repository, 'findByTokenHash')
      .mockRejectedValueOnce(new Error('Database unavailable'));
    expect((await app.inject({ url: '/me', headers: { cookie: cookie() } })).statusCode).toBe(500);
    lookup.mockRestore();
    const membership = vi
      .spyOn(app.get(TenantDatabase), 'forStore')
      .mockRejectedValueOnce(new Error('Database unavailable'));
    expect((await getCustomer()).statusCode).toBe(500);
    membership.mockRestore();
  });
  it('rejects expired sessions and disabled identities on account and store routes', async () => {
    const expired = await service.create(userId, { isRemembered: false });
    await admin.db
      .update(sessions)
      .set({ expiresAt: new Date(0) })
      .where(eq(sessions.id, expired.session.id));
    for (const url of ['/me', `/contacts/${customerId}`]) {
      expect(
        (await app.inject({ url, headers: { cookie: `dakly_session=${expired.token}` } }))
          .statusCode,
      ).toBe(401);
    }
    await admin.db.update(users).set({ isDisabled: true }).where(eq(users.id, userId));
    expect((await getCustomer()).statusCode).toBe(401);
    expect((await app.inject({ url: '/me', headers: { cookie: cookie() } })).statusCode).toBe(401);
    await admin.db.update(users).set({ isDisabled: false }).where(eq(users.id, userId));
  });
  it('renews remembered cookie attributes and clears the cookie when signing out', async () => {
    const response = await getCustomer();
    const setCookie = String(response.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('Max-Age=2592000');
    const environment = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(String((await getCustomer()).headers['set-cookie'])).toContain('; Secure');
    } finally {
      process.env.NODE_ENV = environment;
    }

    const device = await service.create(userId, { isRemembered: false });
    const deviceCookie = `dakly_session=${device.token}`;
    const signedOut = await app.inject({
      method: 'POST',
      url: '/auth/sign-out',
      headers: { cookie: deviceCookie, origin },
    });
    expect(signedOut.statusCode).toBe(204);
    expect(String(signedOut.headers['set-cookie'])).toContain('Expires=Thu, 01 Jan 1970');
    expect((await app.inject({ url: '/me', headers: { cookie: deviceCookie } })).statusCode).toBe(
      401,
    );
  });
  it('does not resurrect a session revoked after a paused lookup before its touch', async () => {
    expect((await getCustomer()).statusCode).toBe(200);
    await admin.db
      .update(sessions)
      .set({ lastSeenAt: new Date(Date.now() - 600000) })
      .where(eq(sessions.id, sessionId));
    const original = repository.findByTokenHash.bind(repository);
    const pause = deferred();
    const read = deferred();
    const spy = vi.spyOn(repository, 'findByTokenHash').mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      read.resolve();
      await pause.promise;
      return result;
    });
    const pending = getCustomer();
    await read.promise;
    const [before] = await admin.db.select().from(sessions).where(eq(sessions.id, sessionId));
    await service.revoke(userId, sessionId);
    pause.resolve();
    await pending;
    spy.mockRestore();
    const [after] = await admin.db.select().from(sessions).where(eq(sessions.id, sessionId));
    expect(after!.lastSeenAt).toEqual(before!.lastSeenAt);
    expect(after!.expiresAt).toEqual(before!.expiresAt);
    expect((await getCustomer()).statusCode).toBe(401);
    expect((await app.inject({ url: '/me', headers: { cookie: cookie() } })).statusCode).toBe(401);
  });
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
