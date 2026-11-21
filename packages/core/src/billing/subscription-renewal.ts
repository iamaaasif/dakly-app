import type { billingCycles } from '@dakly/contracts/billing';

import { DAY_MS } from '../platform/time';

type Cycle = (typeof billingCycles)[number];

// Days after the due date. The first three are retries, the last starts read-only mode (PAY-R15).
export const DUNNING_DAYS = [1, 3, 5, 8] as const;

export function nextPeriodEnd(start: Date, cycle: Cycle): Date {
  const end = new Date(start);
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + (cycle === 'monthly' ? 1 : 12));
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return end;
}

export function dunningStepAt(pastDueSince: Date, step: number): Date | null {
  const days = DUNNING_DAYS[step];
  return days === undefined ? null : new Date(pastDueSince.getTime() + days * DAY_MS);
}

type Coupon = {
  kind: 'percent' | 'amount';
  discountPercent: number | null;
  discountAmountPoisha: number | null;
};

// A coupon with an end time stops applying once the period it ends in is over; forever has none.
export function renewalAmountPoisha(
  pricePoisha: number,
  coupon: Coupon | null,
  couponEndsAt: Date | null,
  periodEnd: Date,
): number {
  if (!coupon || (couponEndsAt && couponEndsAt <= periodEnd)) return pricePoisha;
  const discount =
    coupon.kind === 'percent'
      ? Math.floor((pricePoisha * (coupon.discountPercent ?? 0)) / 100)
      : (coupon.discountAmountPoisha ?? 0);
  return Math.max(0, pricePoisha - discount);
}

type Terms = {
  billingCycle: Cycle;
  planId: string;
  pricePoisha: number;
  pendingPlan: { id: string; monthlyPricePoisha: number; yearlyPricePoisha: number } | null;
  pendingPricePoisha: number | null;
  priceChangeStartsAt: Date | null;
  coupon: Coupon | null;
  couponEndsAt: Date | null;
  currentPeriodEnd: Date;
};

// The plan and price the next period starts with: a scheduled plan change, or a price change whose
// notice period has passed (ADM-R10), less any coupon still running.
export function nextPeriodTerms(subscription: Terms) {
  const { pendingPlan, currentPeriodEnd, pendingPricePoisha } = subscription;
  const isPriceChangeApplied =
    pendingPricePoisha !== null &&
    subscription.priceChangeStartsAt !== null &&
    subscription.priceChangeStartsAt <= currentPeriodEnd;
  const pricePoisha = priceFor(subscription, isPriceChangeApplied);
  return {
    planId: pendingPlan?.id ?? subscription.planId,
    pricePoisha,
    hasPendingChange: isPriceChangeApplied || pendingPlan !== null,
    amountPoisha: renewalAmountPoisha(
      pricePoisha,
      subscription.coupon,
      subscription.couponEndsAt,
      currentPeriodEnd,
    ),
  };
}

function priceFor(subscription: Terms, isPriceChangeApplied: boolean): number {
  const { pendingPlan, billingCycle } = subscription;
  if (pendingPlan)
    return billingCycle === 'monthly'
      ? pendingPlan.monthlyPricePoisha
      : pendingPlan.yearlyPricePoisha;
  return isPriceChangeApplied
    ? (subscription.pendingPricePoisha ?? subscription.pricePoisha)
    : subscription.pricePoisha;
}
