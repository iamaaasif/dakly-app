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
import { stores, storeCounters } from '@dakly/db/schema/stores';
import { memberships } from '@dakly/db/schema/team';
import { auditLog } from '@dakly/db/schema/platform';
import { DatabaseModule } from '../platform/database/database.module';
import { SessionsModule } from '../sessions/sessions.module';
import { SessionsService } from '../sessions/sessions.service';
import { BillingService } from '../billing/billing.service';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { registerSessionCookies } from '../platform/http/session-cookie';

import { StoresModule } from './stores.module';
import { StoresRepository } from './stores.repository';
import { TenantDatabase } from '../platform/database/tenant-database';

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

describe('Store onboarding (Fastify and Postgres)', () => {
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
    await admin.db.delete(storeCounters).where(inArray(storeCounters.storeId, storeIds));
    await admin.db.delete(stores).where(inArray(stores.id, storeIds));
    await admin.db.delete(users).where(inArray(users.id, userIds));
    await admin.db.delete(plans).where(inArray(plans.code, planCodes));
    await app?.close();
    await admin.pool.end();
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
});
