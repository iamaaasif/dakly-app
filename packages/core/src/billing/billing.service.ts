import { Inject, Injectable } from '@nestjs/common';

import type { PublicPlan, billingCycles } from '@dakly/contracts/billing';

import { Clock } from '../platform/clock';
import { DAY_MS } from '../platform/time';
import { billingError } from './billing.errors';
import { BillingRepository } from './billing.repository';

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

  async startPlan(storeId: string, code: string, cycle: (typeof billingCycles)[number]) {
    const plan = await this.repository.findPlan(code);
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
      currentPeriodEnd: trialEndsAt ?? nextPeriod(now, cycle),
    });
  }
}
function nextPeriod(start: Date, cycle: (typeof billingCycles)[number]): Date {
  const end = new Date(start);
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + (cycle === 'monthly' ? 1 : 12));
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return end;
}
