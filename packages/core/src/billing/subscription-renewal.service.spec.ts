import { describe, expect, it } from 'vitest';

import type { DaklyEvent } from '@dakly/contracts/events/dakly-event';

import type { PaymentsService } from '../payments/payments.service';
import type { Clock } from '../platform/clock';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { OutboxService } from '../platform/outbox/outbox.service';
import type { BillingRepository, SubscriptionUpdate } from './billing.repository';
import { SubscriptionRenewalService } from './subscription-renewal.service';

const day = 24 * 60 * 60 * 1000;
const due = new Date('2028-02-10T04:00:00Z');
type Row = NonNullable<Awaited<ReturnType<BillingRepository['lockForRenewal']>>>;
const base: Row = {
  id: 'subscription-id',
  status: 'active',
  billingCycle: 'monthly',
  planId: 'growth',
  pricePoisha: 349000,
  pendingPlan: null,
  pendingPricePoisha: null,
  priceChangeStartsAt: null,
  coupon: null,
  couponEndsAt: null,
  currentPeriodEnd: due,
  isCancellationScheduled: false,
  pastDueSince: null,
  renewalAttempts: 0,
  nextRenewalAttemptAt: null,
  lastPaymentIntentId: null,
};

function setup(row: Partial<Row>, now: Date, payment?: { amountPoisha: number }) {
  const updates: SubscriptionUpdate[] = [];
  const events: DaklyEvent[] = [];
  const service = new SubscriptionRenewalService(
    {
      lockForRenewal: async () => ({ ...base, ...row }),
      updateSubscription: async (_storeId: string, values: SubscriptionUpdate) => {
        updates.push(values);
      },
    } as unknown as BillingRepository,
    { succeededSubscriptionPayment: async () => payment } as unknown as PaymentsService,
    { run: (_storeId: string, work: () => Promise<unknown>) => work() } as StoreTransaction,
    { now: () => now } as Clock,
    {
      publish: async (event: DaklyEvent) => {
        events.push(event);
      },
    } as unknown as OutboxService,
  );
  return { service, updates, events };
}

describe('SubscriptionRenewalService.renew', () => {
  it('does nothing before the period ends', async () => {
    const { service, updates } = setup({}, new Date(due.getTime() - day));
    await service.renew('store-id');
    expect(updates).toEqual([]);
  });

  it('rolls a free plan into the next period without a payment', async () => {
    const { service, updates, events } = setup({ pricePoisha: 0 }, due);
    await service.renew('store-id');
    expect(updates[0]).toMatchObject({
      status: 'active',
      currentPeriodStart: due,
      currentPeriodEnd: new Date('2028-03-10T04:00:00Z'),
    });
    expect(events.map((event) => event.type)).toEqual(['subscription.renewed']);
  });

  it('rolls a plan fully covered by a coupon without a payment', async () => {
    const coupon = { kind: 'percent', discountPercent: 100, discountAmountPoisha: null } as const;
    const { service, updates } = setup({ coupon }, due);
    await service.renew('store-id');
    expect(updates[0]).toMatchObject({ status: 'active', currentPeriodPricePoisha: 349000 });
  });

  it('marks an unpaid plan past due and schedules the first retry for day 1', async () => {
    const { service, updates, events } = setup({}, new Date(due.getTime() + 6 * 60 * 60 * 1000));
    await service.renew('store-id');
    expect(updates[0]).toMatchObject({
      status: 'past_due',
      pastDueSince: due,
      nextRenewalAttemptAt: new Date(due.getTime() + day),
    });
    expect(events[0]).toMatchObject({ type: 'subscription.past_due', payload: { attempt: 0 } });
  });

  it('cancels a plan whose cancellation was scheduled', async () => {
    const { service, updates } = setup({ isCancellationScheduled: true }, due);
    await service.renew('store-id');
    expect(updates[0]).toMatchObject({ status: 'cancelled' });
  });

  it('retries on days 1, 3 and 5 and goes read-only on day 8', async () => {
    const steps = [
      { attempts: 0, nextDay: 3, type: 'subscription.past_due' },
      { attempts: 1, nextDay: 5, type: 'subscription.past_due' },
      { attempts: 2, nextDay: 8, type: 'subscription.past_due' },
      { attempts: 3, nextDay: null, type: 'subscription.read_only' },
    ] as const;
    for (const { attempts, nextDay, type } of steps) {
      const days = [1, 3, 5, 8][attempts] ?? 0;
      const attemptAt = new Date(due.getTime() + days * day);
      const { service, updates, events } = setup(
        {
          status: 'past_due',
          pastDueSince: due,
          renewalAttempts: attempts,
          nextRenewalAttemptAt: attemptAt,
        },
        attemptAt,
      );
      await service.renew('store-id');
      expect(updates[0]?.nextRenewalAttemptAt).toEqual(
        nextDay === null ? null : new Date(due.getTime() + nextDay * day),
      );
      expect(updates[0]?.status).toBe(type === 'subscription.read_only' ? 'read_only' : 'past_due');
      expect(events[0]?.type).toBe(type);
    }
  });

  it('waits for a retry that is not due yet', async () => {
    const { service, updates } = setup(
      {
        status: 'past_due',
        pastDueSince: due,
        nextRenewalAttemptAt: new Date(due.getTime() + day),
      },
      due,
    );
    await service.renew('store-id');
    expect(updates).toEqual([]);
  });
});

describe('SubscriptionRenewalService.applyPayment', () => {
  it('starts the next period and ends read-only mode', async () => {
    const now = new Date(due.getTime() + 9 * day);
    const { service, updates, events } = setup({ status: 'read_only', pastDueSince: due }, now, {
      amountPoisha: 349000,
    });
    await service.applyPayment('store-id', 'intent-id');
    expect(updates[0]).toMatchObject({
      status: 'active',
      currentPeriodStart: now,
      pastDueSince: null,
      readOnlySince: null,
      nextRenewalAttemptAt: null,
      lastPaymentIntentId: 'intent-id',
    });
    expect(events.map((event) => event.type)).toEqual(['subscription.renewed']);
  });

  it('keeps the period start on the due date when the plan is paid early', async () => {
    const { service, updates } = setup({}, new Date(due.getTime() - 2 * day), {
      amountPoisha: 349000,
    });
    await service.applyPayment('store-id', 'intent-id');
    expect(updates[0]).toMatchObject({ currentPeriodStart: due });
  });

  it('applies the same payment once', async () => {
    const { service, updates } = setup({ lastPaymentIntentId: 'intent-id' }, due, {
      amountPoisha: 349000,
    });
    await service.applyPayment('store-id', 'intent-id');
    expect(updates).toEqual([]);
  });

  it('ignores a payment that is not a plan payment', async () => {
    const { service, updates } = setup({}, due, undefined);
    await service.applyPayment('store-id', 'intent-id');
    expect(updates).toEqual([]);
  });

  it('refuses a payment below the price and leaves the plan unchanged', async () => {
    const { service, updates } = setup({}, due, { amountPoisha: 100000 });
    await expect(service.applyPayment('store-id', 'intent-id')).rejects.toMatchObject({
      code: 'SUBSCRIPTION_PAYMENT_TOO_LOW',
    });
    expect(updates).toEqual([]);
  });

  it('charges the price of a scheduled plan change', async () => {
    const pendingPlan = { id: 'pro', monthlyPricePoisha: 699000, yearlyPricePoisha: 6990000 };
    const { service, updates } = setup({ pendingPlan }, due, { amountPoisha: 699000 });
    await service.applyPayment('store-id', 'intent-id');
    expect(updates[0]).toMatchObject({
      planId: 'pro',
      currentPeriodPricePoisha: 699000,
      pendingPlanId: null,
    });
  });
});
