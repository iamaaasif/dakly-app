import { Inject, Injectable } from '@nestjs/common';

import type { PublicPlan, UsageUnit, billingCycles } from '@dakly/contracts/billing';

import { Clock } from '../platform/clock';
import { DAY_MS } from '../platform/time';
import { billingError } from './billing.errors';
import { BillingRepository } from './billing.repository';
import { nextPeriodEnd } from './subscription-renewal';

@Injectable()
export class BillingService {
  constructor(
    @Inject(BillingRepository) private readonly repository: BillingRepository,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async publicPlans(): Promise<PublicPlan[]> {
    return (await this.repository.publicPlans()).map(
      ({ code, name, monthlyPricePoisha, yearlyPricePoisha, trialDays, limits }) => ({
        code,
        name,
        monthlyPricePoisha,
        yearlyPricePoisha,
        trialDays,
        limits,
      }),
    );
  }

  async seatLimit(storeId: string): Promise<number> {
    return (await this.repository.currentLimits(storeId))?.seats ?? 0;
  }

  // Only the base plan's limits count; add-ons carry no allowance until their purchase flow exists.
  async currentAllowance(storeId: string, unit: UsageUnit) {
    const period = await this.repository.currentPeriod(storeId);
    if (!period) throw billingError('SUBSCRIPTION_NOT_FOUND');
    return {
      allowance: period.limits[unit] ?? 0,
      periodStart: period.currentPeriodStart,
      periodEnd: period.currentPeriodEnd,
    };
  }

  async startPlan(storeId: string, code: string, cycle: (typeof billingCycles)[number]) {
    const plan = await this.repository.findPlan(storeId, code);
    if (!plan || plan.kind !== 'plan' || !plan.isPublic) throw billingError('PLAN_NOT_FOUND');
    const price = cycle === 'monthly' ? plan.monthlyPricePoisha : plan.yearlyPricePoisha;
    if (price > 0 && plan.trialDays === 0) throw billingError('PLAN_NEEDS_PAYMENT');
    const now = this.clock.now();
    const trialEndsAt = price > 0 ? new Date(now.getTime() + plan.trialDays * DAY_MS) : null;
    return this.repository.insertSubscription(storeId, {
      planId: plan.id,
      billingCycle: cycle,
      status: trialEndsAt ? 'trialing' : 'active',
      currentPeriodPricePoisha: price,
      trialEndsAt,
      currentPeriodStart: now,
      currentPeriodEnd: trialEndsAt ?? nextPeriodEnd(now, cycle),
    });
  }
}
