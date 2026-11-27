import { Inject, Injectable } from '@nestjs/common';

import type { AdminPlan, UpdatePlanInput } from '@dakly/contracts/admin-plans';
import type { PublicPlan, UsageUnit, billingCycles } from '@dakly/contracts/billing';

import { Clock } from '../platform/clock';
import { DAY_MS, MINUTE_MS } from '../platform/time';
import { billingError } from './billing.errors';
import { BillingRepository } from './billing.repository';
import { nextPeriodEnd } from './subscription-renewal';

const READ_ONLY_RECHECK_MS = 5 * MINUTE_MS;

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

  async catalogue(): Promise<AdminPlan[]> {
    return (await this.repository.allPlans()).map(toAdminPlan);
  }

  async updatePlan(input: {
    auditId: string;
    staffUserId: string;
    code: string;
    change: UpdatePlanInput;
    ip: string;
  }): Promise<AdminPlan> {
    return toAdminPlan(await this.repository.updatePlan(input));
  }

  async seatLimit(storeId: string): Promise<number> {
    return (await this.repository.currentLimits(storeId))?.seats ?? 0;
  }

  // Content credits one AI reply draft costs once the plan's free drafts for the month are used.
  // A plan that does not set it charges one; 0 keeps every draft free.
  async replyDraftCredits(storeId: string): Promise<number> {
    return (await this.repository.currentLimits(storeId))?.ai_reply_draft_credits ?? 1;
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

  async isReadOnly(storeId: string): Promise<boolean> {
    return (await this.repository.subscriptionStatus(storeId)) === 'read_only';
  }

  // Reading stays open; anything that sends, posts or automates calls this first.
  async assertWritable(storeId: string): Promise<void> {
    if (await this.isReadOnly(storeId)) throw billingError('STORE_READ_ONLY');
  }

  // Background work waits and tries again, so it resumes as soon as the plan is paid.
  async deferIfReadOnly(storeId: string): Promise<{ delayUntil: number } | undefined> {
    if (!(await this.isReadOnly(storeId))) return undefined;
    return { delayUntil: this.clock.now().getTime() + READ_ONLY_RECHECK_MS };
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

function toAdminPlan(plan: Awaited<ReturnType<BillingRepository['allPlans']>>[number]): AdminPlan {
  return {
    code: plan.code,
    kind: plan.kind,
    name: plan.name,
    trialDays: plan.trialDays,
    monthlyPricePoisha: plan.monthlyPricePoisha,
    yearlyPricePoisha: plan.yearlyPricePoisha,
    limits: plan.limits,
    isPublic: plan.isPublic,
    updatedAt: plan.updatedAt.toISOString(),
  };
}
