import { describe, expect, it } from 'vitest';

import { Clock } from '../platform/clock';
import type { BillingRepository, Plan } from './billing.repository';
import { BillingService } from './billing.service';

const now = new Date('2028-01-31T10:00:00Z');
const plan: Plan = {
  id: 'plan-id',
  code: 'growth',
  name: 'Growth',
  kind: 'plan',
  isPublic: true,
  monthlyPricePoisha: 349000,
  yearlyPricePoisha: 3490000,
  trialDays: 14,
  limits: { customers: 10000 },
};
function service(change: Partial<Plan> = {}) {
  const repository = {
    findPlan: async () => ({ ...plan, ...change }),
    insertSubscription: async (_storeId: string, input: object) => input,
  };
  return new BillingService(
    repository as unknown as BillingRepository,
    { now: () => now } as Clock,
  );
}
describe('BillingService', () => {
  it('starts a zero-price cycle without a trial even when trial days are set', async () => {
    expect(
      await service({ monthlyPricePoisha: 0 }).startPlan('store-id', 'growth', 'monthly'),
    ).toMatchObject({
      status: 'active',
      trialEndsAt: null,
      currentPeriodPricePoisha: 0,
      currentPeriodEnd: new Date('2028-02-29T10:00:00Z'),
    });
  });
  it('uses the yearly price and current trial days for a paid trial', async () => {
    expect(
      await service({ trialDays: 30 }).startPlan('store-id', 'growth', 'yearly'),
    ).toMatchObject({
      billingCycle: 'yearly',
      status: 'trialing',
      currentPeriodPricePoisha: 3490000,
      trialEndsAt: new Date('2028-03-01T10:00:00Z'),
      currentPeriodEnd: new Date('2028-03-01T10:00:00Z'),
    });
  });
  it('refuses a paid plan with no trial until checkout exists', async () => {
    await expect(
      service({ trialDays: 0 }).startPlan('store-id', 'growth', 'monthly'),
    ).rejects.toMatchObject({ code: 'PLAN_NEEDS_PAYMENT', status: 409 });
  });
  it.each([{ kind: 'add_on' as const }, { isPublic: false }])(
    'refuses a plan that cannot be picked publicly %j',
    async (change) => {
      await expect(
        service(change).startPlan('store-id', 'growth', 'monthly'),
      ).rejects.toMatchObject({ code: 'PLAN_NOT_FOUND' });
    },
  );
  it('uses a zero yearly price even when the monthly price is paid', async () => {
    expect(
      await service({ yearlyPricePoisha: 0, trialDays: 0 }).startPlan(
        'store-id',
        'growth',
        'yearly',
      ),
    ).toMatchObject({
      status: 'active',
      trialEndsAt: null,
      currentPeriodPricePoisha: 0,
      currentPeriodEnd: new Date('2029-01-31T10:00:00Z'),
    });
  });
  it('refuses a missing plan', async () => {
    const billing = new BillingService(
      { findPlan: async () => undefined } as unknown as BillingRepository,
      new Clock(),
    );
    await expect(billing.startPlan('store-id', 'missing', 'monthly')).rejects.toMatchObject({
      code: 'PLAN_NOT_FOUND',
    });
  });
  it('reads the unit allowance and the current period, with 0 for a unit the plan omits', async () => {
    const currentPeriodStart = new Date('2028-01-15T04:00:00Z');
    const currentPeriodEnd = new Date('2028-02-15T04:00:00Z');
    const billing = new BillingService(
      {
        currentPeriod: async () => ({
          limits: { ai_ask: 100 },
          currentPeriodStart,
          currentPeriodEnd,
        }),
      } as unknown as BillingRepository,
      new Clock(),
    );
    expect(await billing.currentAllowance('store-id', 'ai_ask')).toEqual({
      allowance: 100,
      periodStart: currentPeriodStart,
      periodEnd: currentPeriodEnd,
    });
    expect(await billing.currentAllowance('store-id', 'ai_content')).toMatchObject({
      allowance: 0,
    });
  });
  it('refuses an allowance read for a store with no subscription', async () => {
    const billing = new BillingService(
      { currentPeriod: async () => undefined } as unknown as BillingRepository,
      new Clock(),
    );
    await expect(billing.currentAllowance('store-id', 'ai_ask')).rejects.toMatchObject({
      code: 'SUBSCRIPTION_NOT_FOUND',
      status: 404,
    });
  });
});
