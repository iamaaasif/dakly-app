import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { users, sessions } from '@dakly/db/schema/auth';
import { plans, subscriptions } from '@dakly/db/schema/billing';
import { contacts } from '@dakly/db/schema/contacts';
import { auditLog } from '@dakly/db/schema/platform';
import { stores, storeCounters } from '@dakly/db/schema/stores';
import { memberships, roles } from '@dakly/db/schema/team';

import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { DatabaseModule } from '../platform/database/database.module';
import { TenantDatabase } from '../platform/database/tenant-database';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { registerSessionCookies } from '../platform/http/session-cookie';
import { SessionsModule } from '../sessions/sessions.module';
import { SessionsService } from '../sessions/sessions.service';
import { StoresModule } from './stores.module';
import { StoresRepository } from './stores.repository';
import { StoresService } from './stores.service';

class TestModule {}
Module({ imports: [DatabaseModule, SessionsModule, StoresModule] })(TestModule);
const input = {
  name: 'রিনার দোকান',
  businessType: 'Clothing',
  district: 'Dhaka',
  howYouSell: ['social_media'],
  customerListSize: '2000_to_10000',
  planCode: 'growth',
  billingCycle: 'yearly',
};

function sendingWith(change: object) {
  return {
    quietHours: { startHour: 21, endHour: 9 },
    frequencyCap: { perChannelPerDay: 1, perSevenDays: 3 },
    onlyOwnersAndAdminsApprove: true,
    ...change,
  };
}

describe('Store onboarding and settings (Fastify and Postgres)', () => {
  const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
  const userIds: string[] = [];
  const storeIds: string[] = [];
  const planCodes: string[] = [];
  let app: NestFastifyApplication;
  let originalTrialDays: number;
  async function account() {
    const [user] = await admin.db
      .insert(users)
      .values({ name: 'Rina', email: `${randomUUID()}@example.test` })
      .returning({ id: users.id });
    userIds.push(user!.id);
    const service = app.get(SessionsService);
    const first = await service.create(user!.id, { isRemembered: false });
    const second = await service.create(user!.id, { isRemembered: false });
    return {
      userId: user!.id,
      sessionId: first.session.id,
      cookies: [first, second].map(({ token }) => `dakly_session=${token}`),
    };
  }
  const post = (cookie: string, payload: object = input, url = '/stores') =>
    app.inject({
      method: 'POST',
      url,
      headers: { origin: 'http://localhost:3000', cookie },
      payload,
    });
  async function subscription(storeId: string) {
    return admin.db.select().from(subscriptions).where(eq(subscriptions.storeId, storeId));
  }
  beforeAll(async () => {
    originalTrialDays = (
      await admin.db.select({ days: plans.trialDays }).from(plans).where(eq(plans.code, 'growth'))
    )[0]!.days;
    app = await NestFactory.create<NestFastifyApplication>(TestModule, new FastifyAdapter(), {
      logger: false,
    });
    await registerSessionCookies(app);
    app.useGlobalFilters(new AppErrorFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await admin.db
      .update(plans)
      .set({ trialDays: originalTrialDays })
      .where(eq(plans.code, 'growth'));
    await admin.db.delete(sessions).where(inArray(sessions.userId, userIds));
    await admin.db.delete(auditLog).where(inArray(auditLog.storeId, storeIds));
    await admin.db.delete(subscriptions).where(inArray(subscriptions.storeId, storeIds));
    await admin.db.delete(memberships).where(inArray(memberships.userId, userIds));
    await admin.db.delete(roles).where(inArray(roles.storeId, storeIds));
    await admin.db.delete(contacts).where(inArray(contacts.storeId, storeIds));
    await admin.db.delete(storeCounters).where(inArray(storeCounters.storeId, storeIds));
    await admin.db.delete(stores).where(inArray(stores.id, storeIds));
    await admin.db.delete(users).where(inArray(users.id, userIds));
    await admin.db.delete(plans).where(inArray(plans.code, planCodes));
    await app?.close();
    await admin.pool.end();
  });
  it('allocates consecutive order numbers to concurrent requests in one store', async () => {
    const owner = await account();
    const response = await post(owner.cookies[0]!);
    expect(response.statusCode).toBe(201);
    const storeId: string = response.json().id;
    storeIds.push(storeId);
    const storesService = app.get(StoresService);

    const numbers = await Promise.all([
      storesService.nextOrderNumber(storeId),
      storesService.nextOrderNumber(storeId),
    ]);

    expect(numbers.sort((a, b) => a - b)).toEqual([1001, 1002]);
  });

  it('creates exactly one yearly Growth trial for parallel sessions and resumes on retry', async () => {
    const owner = await account();
    const responses = await Promise.all(owner.cookies.map((cookie) => post(cookie)));
    for (const response of responses) if (response.json().id) storeIds.push(response.json().id);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 201]);
    const storeId = responses[0]!.json().id;
    expect(responses[1]!.json()).toEqual(responses[0]!.json());
    expect(responses[0]!.json()).toMatchObject({
      name: input.name,
      extensions: ['sales', 'chats', 'social_auto_post'],
    });
    expect(responses[0]!.json().slug).toMatch(/^[a-z0-9][a-z0-9-]{2,39}$/);
    expect(
      await admin.db.select().from(memberships).where(eq(memberships.userId, owner.userId)),
    ).toMatchObject([{ storeId, builtInRole: 'owner', status: 'active' }]);
    const rows = await subscription(storeId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      billingCycle: 'yearly',
      status: 'trialing',
      currentPeriodPricePoisha: 3490000,
    });
    expect(rows[0]!.trialEndsAt!.getTime() - rows[0]!.currentPeriodStart.getTime()).toBe(
      originalTrialDays * 86400000,
    );
    expect(
      await admin.db.select().from(storeCounters).where(eq(storeCounters.storeId, storeId)),
    ).toHaveLength(1);
    expect(
      await admin.db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.storeId, storeId), eq(auditLog.action, 'store.created'))),
    ).toHaveLength(1);
    expect(
      (await admin.db.select().from(sessions).where(eq(sessions.userId, owner.userId))).map(
        (row) => row.activeStoreId,
      ),
    ).toEqual([storeId, storeId]);
    const retry = await post(owner.cookies[0]!, { ...input, planCode: 'missing', name: 'Changed' });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual(responses[0]!.json());
  });
  it('reads updated trial days for new stores while preserving existing trials', async () => {
    const firstOwner = await account();
    const first = await post(firstOwner.cookies[0]!);
    expect(first.statusCode).toBe(201);
    const oldStore = first.json().id;
    storeIds.push(oldStore);
    const oldTrial = (await subscription(oldStore))[0]!.trialEndsAt;
    await admin.db.update(plans).set({ trialDays: 30 }).where(eq(plans.code, 'growth'));
    const response = await app.inject({ url: '/plans' });
    expect(response.statusCode).toBe(200);
    expect(
      response.json().plans.find((plan: { code: string }) => plan.code === 'growth'),
    ).toMatchObject({ trialDays: 30 });
    expect(response.json().recommendations).toMatchObject({
      under_500: 'starter',
      over_10000: 'pro',
    });
    const owner = await account();
    const created = await post(owner.cookies[0]!);
    storeIds.push(created.json().id);
    expect(created.statusCode).toBe(201);
    const [current] = await subscription(created.json().id);
    expect(current!.trialEndsAt!.getTime() - current!.currentPeriodStart.getTime()).toBe(
      30 * 86400000,
    );
    expect((await subscription(oldStore))[0]!.trialEndsAt).toEqual(oldTrial);
  });
  it('rolls back every store write when starting the plan fails after insertion', async () => {
    const owner = await account();
    const billing = app.get(BillingService);
    const start = billing.startPlan.bind(billing);
    let failedStore = '';
    const fault = vi.spyOn(billing, 'startPlan').mockImplementationOnce(async (...args) => {
      failedStore = args[0];
      await start(...args);
      throw new Error('plan write failed');
    });
    const result = await post(owner.cookies[0]!);
    fault.mockRestore();
    expect(result.statusCode).toBe(500);
    expect(await admin.db.select().from(stores).where(eq(stores.id, failedStore))).toEqual([]);
    expect(
      await admin.db.select().from(memberships).where(eq(memberships.userId, owner.userId)),
    ).toEqual([]);
    expect(
      await admin.db.select().from(storeCounters).where(eq(storeCounters.storeId, failedStore)),
    ).toEqual([]);
    expect(await subscription(failedStore)).toEqual([]);
  });
  it.each(['/stores', '/me/active-store'])(
    'recovers through %s when session activation fails after commit',
    async (recovery) => {
      const owner = await account();
      const fault = vi
        .spyOn(app.get(SessionsService), 'setActiveStore')
        .mockRejectedValueOnce(new Error('session write failed'));
      expect((await post(owner.cookies[0]!)).statusCode).toBe(500);
      fault.mockRestore();
      const [membership] = await admin.db
        .select()
        .from(memberships)
        .where(eq(memberships.userId, owner.userId));
      storeIds.push(membership!.storeId);
      expect(
        (await admin.db.select().from(sessions).where(eq(sessions.userId, owner.userId)))[0]!
          .activeStoreId,
      ).toBeNull();
      const response = await post(
        owner.cookies[0]!,
        recovery === '/stores' ? input : { storeId: membership!.storeId },
        recovery,
      );
      expect(response.statusCode).toBe(recovery === '/stores' ? 200 : 204);
      expect(await subscription(membership!.storeId)).toHaveLength(1);
      expect(
        (await admin.db.select().from(sessions).where(eq(sessions.userId, owner.userId))).filter(
          (row) => row.activeStoreId === membership!.storeId,
        ),
      ).toHaveLength(1);
    },
  );
  it('rejects missing sessions, origins and client-selected store ids', async () => {
    expect((await post('')).statusCode).toBe(401);
    const owner = await account();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/stores',
          headers: { cookie: owner.cookies[0]! },
          payload: input,
        })
      ).statusCode,
    ).toBe(403);
    expect((await post(owner.cookies[0]!, { ...input, storeId: randomUUID() })).statusCode).toBe(
      400,
    );
  });
  it('lists only public base plans and refuses hidden, add-on, unknown and no-trial plans', async () => {
    const rows = [
      { code: `hidden-${randomUUID()}`, kind: 'plan' as const, isPublic: false, trialDays: 14 },
      { code: `addon-${randomUUID()}`, kind: 'add_on' as const, isPublic: true, trialDays: 14 },
      { code: `paid-${randomUUID()}`, kind: 'plan' as const, isPublic: true, trialDays: 0 },
    ];
    planCodes.push(...rows.map((row) => row.code));
    await admin.db.insert(plans).values(
      rows.map((row) => ({
        ...row,
        name: 'Fixture',
        monthlyPricePoisha: 12300,
        yearlyPricePoisha: 123000,
        limits: { customers: 42 },
      })),
    );
    const catalogue = (await app.inject({ url: '/plans' })).json().plans;
    expect(catalogue.map((plan: { code: string }) => plan.code)).not.toContain(rows[0]!.code);
    expect(catalogue.map((plan: { code: string }) => plan.code)).not.toContain(rows[1]!.code);
    expect(catalogue.find((plan: { code: string }) => plan.code === rows[2]!.code)).toEqual({
      code: rows[2]!.code,
      name: 'Fixture',
      monthlyPricePoisha: 12300,
      yearlyPricePoisha: 123000,
      trialDays: 0,
      limits: { customers: 42 },
    });
    const owner = await account();
    for (const [planCode, status, code] of [
      [rows[0]!.code, 404, 'PLAN_NOT_FOUND'],
      [rows[1]!.code, 404, 'PLAN_NOT_FOUND'],
      ['missing', 404, 'PLAN_NOT_FOUND'],
      [rows[2]!.code, 409, 'PLAN_NEEDS_PAYMENT'],
    ] as const) {
      const response = await post(owner.cookies[0]!, { ...input, planCode });
      expect(response.statusCode).toBe(status);
      expect(response.json().error.code).toBe(code);
    }
    expect(
      await admin.db.select().from(memberships).where(eq(memberships.userId, owner.userId)),
    ).toEqual([]);
  });
  it('starts Free without a trial and records shop answers without Physical Shop', async () => {
    const owner = await account();
    const response = await post(owner.cookies[0]!, {
      ...input,
      planCode: 'free',
      howYouSell: ['shop_without_pos'],
    });
    expect(response.statusCode).toBe(201);
    const storeId = response.json().id;
    storeIds.push(storeId);
    expect(response.json().extensions).toEqual([]);
    expect((await subscription(storeId))[0]).toMatchObject({
      status: 'active',
      trialEndsAt: null,
      currentPeriodPricePoisha: 0,
    });
    expect((await admin.db.select().from(stores).where(eq(stores.id, storeId)))[0]).toMatchObject({
      businessType: input.businessType,
      district: input.district,
      howYouSell: ['shop_without_pos'],
      onboardingCustomerCountRange: input.customerListSize,
    });
  });
  it('does not confuse staff membership with an owned store or expose another tenant', async () => {
    const owner = await account();
    const [other] = await admin.db
      .insert(stores)
      .values({ name: 'Other owner shop' })
      .returning({ id: stores.id });
    storeIds.push(other!.id);
    await admin.db.insert(memberships).values({
      userId: owner.userId,
      storeId: other!.id,
      builtInRole: 'support_agent',
      status: 'active',
    });
    const response = await post(owner.cookies[0]!, { ...input, planCode: 'free' });
    expect(response.statusCode).toBe(201);
    const storeId = response.json().id;
    storeIds.push(storeId);
    expect(storeId).not.toBe(other!.id);
    const tenant = app.get(TenantDatabase);
    await tenant.forStore(other!.id, async (tx) => {
      expect(await tx.select({ id: stores.id }).from(stores).where(eq(stores.id, storeId))).toEqual(
        [],
      );
      expect(
        await tx
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(eq(subscriptions.storeId, storeId)),
      ).toEqual([]);
      await expect(app.get(StoresRepository).find(storeId)).rejects.toThrow(
        'Cannot change stores inside a transaction',
      );
      await expect(
        app.get(StoresRepository).insert(
          storeId,
          {
            ...input,
            howYouSell: ['social_media'],
            customerListSize: '2000_to_10000',
            billingCycle: 'yearly',
          },
          [],
        ),
      ).rejects.toThrow('Cannot change stores inside a transaction');
      await expect(app.get(BillingService).startPlan(storeId, 'free', 'monthly')).rejects.toThrow(
        'Cannot change stores inside a transaction',
      );
    });
    const unrelated = await account();
    expect((await post(unrelated.cookies[0]!, { storeId }, '/me/active-store')).statusCode).toBe(
      404,
    );
  });
  const patch = (cookie: string, payload: object, url = '/store') =>
    app.inject({
      method: 'PATCH',
      url,
      headers: { origin: 'http://localhost:3000', cookie },
      payload,
    });
  const settings = (cookie: string, url = '/store') => app.inject({ url, headers: { cookie } });
  async function settingsStore() {
    const owner = await account();
    const created = await post(owner.cookies[0]!);
    expect(created.statusCode).toBe(201);
    storeIds.push(created.json().id);
    return { owner, storeId: created.json().id as string, cookie: owner.cookies[0]! };
  }
  async function staff(
    storeId: string,
    builtInRole: 'admin' | 'marketer' | 'support_agent' | null,
    level?: 'view' | 'edit',
  ) {
    const member = await account();
    let roleId: string | undefined;
    if (level) {
      const [role] = await admin.db
        .insert(roles)
        .values({ storeId, name: randomUUID(), permissions: { storeSettings: level } })
        .returning({ id: roles.id });
      roleId = role!.id;
    }
    await admin.db
      .insert(memberships)
      .values({ storeId, userId: member.userId, builtInRole, roleId, status: 'active' });
    await app.get(SessionsService).setActiveStore(member.userId, member.sessionId, storeId);
    return member.cookies[0]!;
  }
  it('reads and changes settings, preserving omitted fields and clearing optional values', async () => {
    const { cookie, storeId } = await settingsStore();
    expect((await settings(cookie)).json()).toMatchObject({
      id: storeId,
      name: input.name,
      district: 'Dhaka',
      phone: null,
      legalName: null,
    });
    const changed = await patch(cookie, {
      name: 'New shop',
      legalName: 'Shop Ltd',
      businessType: 'Books',
      phone: '+880 ১৭১২-৩৪৫৬৭৮',
      email: 'shop@example.test',
      address: 'House 1',
      district: 'Sylhet',
      vatBin: '1234567890123',
      tradeLicenceNumber: 'TL-1',
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({
      id: storeId,
      name: 'New shop',
      legalName: 'Shop Ltd',
      businessType: 'Books',
      phone: '01712345678',
      email: 'shop@example.test',
      address: 'House 1',
      district: 'Sylhet',
      vatBin: '1234567890123',
      tradeLicenceNumber: 'TL-1',
    });
    const cleared = await patch(cookie, {
      legalName: null,
      businessType: null,
      phone: null,
      email: null,
      address: null,
      district: null,
      vatBin: null,
      tradeLicenceNumber: null,
    });
    expect(cleared.statusCode).toBe(200);
    expect((await settings(cookie)).json()).toMatchObject({
      name: 'New shop',
      legalName: null,
      businessType: null,
      phone: null,
      email: null,
      address: null,
      district: null,
      vatBin: null,
      tradeLicenceNumber: null,
    });
    const [entry] = await admin.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.storeId, storeId), eq(auditLog.action, 'store.settings_changed')));
    expect(entry).toMatchObject({
      entityId: storeId,
      entityType: 'store',
      actorUserId: (
        await admin.db.select().from(memberships).where(eq(memberships.storeId, storeId))
      )[0]!.userId,
      after: {
        changedFields: [
          'name',
          'legalName',
          'businessType',
          'phone',
          'email',
          'address',
          'district',
          'vatBin',
          'tradeLicenceNumber',
        ],
      },
    });
    expect(JSON.stringify(entry)).not.toContain('shop@example.test');
    expect(entry!.before).toBeNull();
  });
  it('reads the sending defaults and saves the whole section', async () => {
    const { cookie } = await settingsStore();
    expect((await settings(cookie)).json().sending).toEqual({
      quietHours: { startHour: 21, endHour: 9 },
      frequencyCap: { perChannelPerDay: 1, perSevenDays: 3 },
      onlyOwnersAndAdminsApprove: true,
    });
    const sending = {
      quietHours: { startHour: 22, endHour: 8 },
      frequencyCap: { perChannelPerDay: 2, perSevenDays: 5 },
      onlyOwnersAndAdminsApprove: false,
    };
    const changed = await patch(cookie, { sending });

    expect(changed.json().sending).toEqual(sending);
    expect((await settings(cookie)).json().sending).toEqual(sending);
    expect((await patch(cookie, { sending: { quietHours: sending.quietHours } })).statusCode).toBe(
      400,
    );
  });
  it('rejects invalid settings and release 2 extensions at the HTTP edge', async () => {
    const { cookie } = await settingsStore();
    for (const payload of [
      {},
      { name: null },
      { vatBin: '123' },
      { storeId: randomUUID(), name: 'Forged' },
      { sending: sendingWith({ quietHours: { startHour: 19, endHour: 9 } }) },
      { sending: sendingWith({ frequencyCap: { perChannelPerDay: 4, perSevenDays: 3 } }) },
      { sending: sendingWith({ frequencyCap: { perChannelPerDay: 1, perSevenDays: 11 } }) },
      { sending: sendingWith({ onlyOwnersAndAdminsApprove: 'yes' }) },
    ])
      expect((await patch(cookie, payload)).statusCode).toBe(400);
    for (const extensions of [['physical_shop'], ['core'], ['chats', 'chats']])
      expect((await patch(cookie, { extensions }, '/store/extensions')).statusCode).toBe(400);
    expect((await settings(cookie)).json().name).toBe(input.name);
  });
  it('enforces settings view and edit and reserves extension changes for Owner and Admin', async () => {
    const { cookie, storeId } = await settingsStore();
    const viewer = await staff(storeId, null, 'view');
    expect((await settings(viewer)).statusCode).toBe(200);
    expect((await patch(viewer, { name: 'Denied' })).statusCode).toBe(403);
    const editor = await staff(storeId, null, 'edit');
    expect((await patch(editor, { name: 'Edited' })).statusCode).toBe(200);
    expect((await patch(editor, { extensions: [] }, '/store/extensions')).statusCode).toBe(403);
    const approvalOff = { sending: sendingWith({ onlyOwnersAndAdminsApprove: false }) };
    expect((await patch(editor, approvalOff)).statusCode).toBe(403);
    expect((await patch(editor, { sending: sendingWith({}) })).statusCode).toBe(200);
    expect((await settings(editor)).json().sending.onlyOwnersAndAdminsApprove).toBe(true);
    for (const role of ['marketer', 'support_agent'] as const) {
      const member = await staff(storeId, role);
      expect((await settings(member)).statusCode).toBe(403);
      expect((await patch(member, { name: 'Denied' })).statusCode).toBe(403);
      expect((await patch(member, { extensions: [] }, '/store/extensions')).statusCode).toBe(403);
    }
    const administrator = await staff(storeId, 'admin');
    expect(
      (await patch(administrator, { extensions: ['sales'] }, '/store/extensions')).statusCode,
    ).toBe(200);
    expect(
      (await patch(cookie, { extensions: ['chats'] }, '/store/extensions')).json().extensions,
    ).toEqual(['chats']);
  });
  it('uses only the active store and blocks cross-store repository operations', async () => {
    const first = await settingsStore();
    const second = await settingsStore();
    expect((await settings(second.cookie, `/store?storeId=${first.storeId}`)).json().id).toBe(
      second.storeId,
    );
    const forged = await app.inject({
      url: '/store',
      headers: { cookie: second.cookie, 'x-store-id': first.storeId },
    });
    expect(forged.json().id).toBe(second.storeId);
    await app.get(TenantDatabase).forStore(second.storeId, async (tx) => {
      expect(
        await tx.select({ id: stores.id }).from(stores).where(eq(stores.id, first.storeId)),
      ).toEqual([]);
      expect(
        await tx
          .update(stores)
          .set({ name: 'Stolen' })
          .where(eq(stores.id, first.storeId))
          .returning({ id: stores.id }),
      ).toEqual([]);
      await expect(app.get(StoresRepository).settings(first.storeId)).rejects.toThrow(
        'Cannot change stores inside a transaction',
      );
      await expect(
        app.get(StoresRepository).changeSettings(first.storeId, { name: 'Stolen' }, new Date()),
      ).rejects.toThrow('Cannot change stores inside a transaction');
      await expect(
        app.get(StoresRepository).changeExtensions(first.storeId, [], new Date()),
      ).rejects.toThrow('Cannot change stores inside a transaction');
    });
    expect((await settings(first.cookie)).json().name).toBe(input.name);
  });
  it('keeps business data when extensions are disabled and records names only', async () => {
    const { cookie, storeId } = await settingsStore();
    const [customer] = await admin.db
      .insert(contacts)
      .values({ storeId, name: 'রিনা', phone: '01712345678', source: 'manual', kind: 'customer' })
      .returning({ id: contacts.id });
    expect(
      (await patch(cookie, { extensions: [] }, '/store/extensions')).json().extensions,
    ).toEqual([]);
    expect(
      await admin.db
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.storeId, storeId)),
    ).toEqual([{ id: customer!.id }]);
    expect(
      (
        await patch(
          cookie,
          { extensions: ['chats', 'sales', 'social_auto_post'] },
          '/store/extensions',
        )
      ).json().extensions,
    ).toEqual(['chats', 'sales', 'social_auto_post']);
    const entries = await admin.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.storeId, storeId), eq(auditLog.action, 'store.extensions_changed')));
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      entityId: storeId,
      before: null,
      after: { changedFields: ['extensions'] },
    });
  });
  it.each([
    ['/store', { name: 'Rolled back' }],
    ['/store/extensions', { extensions: [] }],
  ])('rolls back %s when its audit fails', async (url, payload) => {
    const { cookie, storeId } = await settingsStore();
    const before = (await settings(cookie)).json();
    const record = app.get(AuditService).record.bind(app.get(AuditService));
    const fault = vi
      .spyOn(app.get(AuditService), 'record')
      .mockImplementationOnce(async (...args) => {
        await record(...args);
        throw new Error('audit failed');
      });
    const result = await patch(cookie, payload, url);
    fault.mockRestore();
    expect(result.statusCode).toBe(500);
    expect((await settings(cookie)).json()).toEqual(before);
    expect(
      await admin.db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.storeId, storeId),
            inArray(auditLog.action, ['store.settings_changed', 'store.extensions_changed']),
          ),
        ),
    ).toEqual([]);
  });
  it('requires sessions, an active store and an allowed origin for settings mutations', async () => {
    expect((await settings('')).statusCode).toBe(401);
    const noStore = await account();
    expect((await settings(noStore.cookies[0]!)).statusCode).toBe(401);
    const { cookie } = await settingsStore();
    for (const url of ['/store', '/store/extensions'])
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url,
            headers: { cookie },
            payload: url === '/store' ? { name: 'Denied' } : { extensions: [] },
          })
        ).statusCode,
      ).toBe(403);
  });
});
