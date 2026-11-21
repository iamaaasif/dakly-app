import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { UpdatePlanInput } from '@dakly/contracts/admin-plans';
import { planLimitsSchema } from '@dakly/contracts/billing';
import type { Database } from '@dakly/db/client';
import { staffAuditLog } from '@dakly/db/schema/admin';
import { coupons, plans, subscriptions } from '@dakly/db/schema/billing';

import { DATABASE } from '../platform/database/database.tokens';
import { StaffDatabase } from '../platform/database/staff-database';
import { TenantDatabase } from '../platform/database/tenant-database';
import { billingError } from './billing.errors';

const planColumns = {
  id: plans.id,
  code: plans.code,
  name: plans.name,
  kind: plans.kind,
  isPublic: plans.isPublic,
  monthlyPricePoisha: plans.monthlyPricePoisha,
  yearlyPricePoisha: plans.yearlyPricePoisha,
  trialDays: plans.trialDays,
  limits: plans.limits,
};
export type Plan = Omit<
  typeof plans.$inferSelect,
  'position' | 'createdAt' | 'updatedAt' | 'limits'
> & { limits: Record<string, number> };
const pendingPlans = alias(plans, 'pending_plans');
export type SubscriptionUpdate = Partial<
  Pick<
    typeof subscriptions.$inferInsert,
    | 'planId'
    | 'status'
    | 'currentPeriodPricePoisha'
    | 'pendingPlanId'
    | 'pendingPricePoisha'
    | 'priceChangeNotifiedAt'
    | 'priceChangeStartsAt'
    | 'trialEndsAt'
    | 'currentPeriodStart'
    | 'currentPeriodEnd'
    | 'pastDueSince'
    | 'renewalAttempts'
    | 'nextRenewalAttemptAt'
    | 'readOnlySince'
    | 'lastPaymentIntentId'
    | 'updatedAt'
  >
>;
type NewSubscription = Pick<
  typeof subscriptions.$inferInsert,
  | 'planId'
  | 'billingCycle'
  | 'status'
  | 'currentPeriodPricePoisha'
  | 'trialEndsAt'
  | 'currentPeriodStart'
  | 'currentPeriodEnd'
>;

@Injectable()
export class BillingRepository {
  constructor(
    @Inject(TenantDatabase) private readonly tenant: TenantDatabase,
    @Inject(DATABASE) private readonly database: Database,
    @Inject(StaffDatabase) private readonly staff: StaffDatabase,
  ) {}

  async publicPlans(): Promise<Plan[]> {
    const rows = await this.database
      .select(planColumns)
      .from(plans)
      .where(and(eq(plans.kind, 'plan'), eq(plans.isPublic, true)))
      .orderBy(asc(plans.position), asc(plans.code));
    return rows.map((row) => ({ ...row, limits: planLimitsSchema.parse(row.limits) }));
  }

  async allPlans(): Promise<(Plan & { updatedAt: Date })[]> {
    const rows = await this.database
      .select({ ...planColumns, updatedAt: plans.updatedAt })
      .from(plans)
      .orderBy(asc(plans.position), asc(plans.code));
    return rows.map((row) => ({ ...row, limits: planLimitsSchema.parse(row.limits) }));
  }

  // The audit row goes in first (D28). Existing subscribers keep the price stored on their
  // subscription, so this changes what new and renewing shops are offered, not what they pay now.
  updatePlan(input: {
    auditId: string;
    staffUserId: string;
    code: string;
    change: UpdatePlanInput;
    ip: string;
  }): Promise<Plan & { updatedAt: Date }> {
    const { change } = input;
    return this.staff.forStaff(input.staffUserId, async (tx) => {
      const [current] = await tx
        .select({ id: plans.id, limits: plans.limits })
        .from(plans)
        .where(eq(plans.code, input.code))
        .for('update');
      if (!current) throw billingError('PLAN_NOT_FOUND');
      const currentKeys = Object.keys(planLimitsSchema.parse(current.limits)).sort();
      if (Object.keys(change.limits).sort().join() !== currentKeys.join())
        throw billingError('PLAN_LIMIT_UNKNOWN');
      await tx.insert(staffAuditLog).values({
        id: input.auditId,
        staffUserId: input.staffUserId,
        action: 'plan.updated',
        targetType: 'plan',
        targetId: current.id,
        reason: change.reason,
        actionDetails: {
          code: input.code,
          name: change.name,
          trialDays: change.trialDays,
          monthlyPricePoisha: change.monthlyPricePoisha,
          yearlyPricePoisha: change.yearlyPricePoisha,
          limits: change.limits,
          isPublic: change.isPublic,
        },
        ip: input.ip,
      });
      const [row] = await tx
        .update(plans)
        .set({
          name: change.name,
          trialDays: change.trialDays,
          monthlyPricePoisha: change.monthlyPricePoisha,
          yearlyPricePoisha: change.yearlyPricePoisha,
          limits: change.limits,
          isPublic: change.isPublic,
          updatedAt: new Date(),
        })
        .where(eq(plans.id, current.id))
        .returning({ ...planColumns, updatedAt: plans.updatedAt });
      if (!row) throw billingError('PLAN_NOT_FOUND');
      return { ...row, limits: planLimitsSchema.parse(row.limits) };
    });
  }

  async findPlan(storeId: string, code: string): Promise<Plan | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx.select(planColumns).from(plans).where(eq(plans.code, code)).limit(1),
    );
    return row ? { ...row, limits: planLimitsSchema.parse(row.limits) } : undefined;
  }

  async insertSubscription(storeId: string, input: NewSubscription) {
    await this.tenant.forStore(storeId, (tx) =>
      tx.insert(subscriptions).values({ storeId, ...input }),
    );
    return input;
  }

  async subscriptionStatus(storeId: string) {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .select({ status: subscriptions.status })
        .from(subscriptions)
        .where(eq(subscriptions.storeId, storeId))
        .limit(1),
    );
    return row?.status;
  }

  async currentLimits(storeId: string): Promise<Record<string, number> | undefined> {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .select({ limits: plans.limits })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .where(eq(subscriptions.storeId, storeId))
        .limit(1),
    );
    return row ? planLimitsSchema.parse(row.limits) : undefined;
  }

  async currentPeriod(
    storeId: string,
  ): Promise<
    { limits: Record<string, number>; currentPeriodStart: Date; currentPeriodEnd: Date } | undefined
  > {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .select({
          limits: plans.limits,
          currentPeriodStart: subscriptions.currentPeriodStart,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
        })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .where(eq(subscriptions.storeId, storeId))
        .limit(1),
    );
    return row ? { ...row, limits: planLimitsSchema.parse(row.limits) } : undefined;
  }

  async dueRenewals(now: Date, after: string | null, limit: number) {
    const { rows } = await this.database.execute<{ store_id: string }>(
      sql`select store_id from due_subscription_renewals(${now.toISOString()}::timestamptz, ${after}::uuid, ${limit})`,
    );
    return rows.map((row) => row.store_id);
  }

  // The row stays locked until the store transaction ends, so a payment and the daily job cannot
  // both move the same period.
  async lockForRenewal(storeId: string) {
    const [row] = await this.tenant.forStore(storeId, (tx) =>
      tx
        .select({
          id: subscriptions.id,
          status: subscriptions.status,
          billingCycle: subscriptions.billingCycle,
          planId: subscriptions.planId,
          pricePoisha: subscriptions.currentPeriodPricePoisha,
          pendingPlan: {
            id: pendingPlans.id,
            monthlyPricePoisha: pendingPlans.monthlyPricePoisha,
            yearlyPricePoisha: pendingPlans.yearlyPricePoisha,
          },
          pendingPricePoisha: subscriptions.pendingPricePoisha,
          priceChangeStartsAt: subscriptions.priceChangeStartsAt,
          coupon: {
            kind: coupons.kind,
            discountPercent: coupons.discountPercent,
            discountAmountPoisha: coupons.discountAmountPoisha,
          },
          couponEndsAt: subscriptions.couponEndsAt,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
          isCancellationScheduled: subscriptions.isCancellationScheduled,
          pastDueSince: subscriptions.pastDueSince,
          renewalAttempts: subscriptions.renewalAttempts,
          nextRenewalAttemptAt: subscriptions.nextRenewalAttemptAt,
          lastPaymentIntentId: subscriptions.lastPaymentIntentId,
        })
        .from(subscriptions)
        .leftJoin(pendingPlans, eq(pendingPlans.id, subscriptions.pendingPlanId))
        .leftJoin(coupons, eq(coupons.id, subscriptions.couponId))
        .where(eq(subscriptions.storeId, storeId))
        .for('no key update', { of: subscriptions }),
    );
    return row && { ...row, pendingPlan: row.pendingPlan?.id ? row.pendingPlan : null };
  }

  async updateSubscription(storeId: string, values: SubscriptionUpdate) {
    await this.tenant.forStore(storeId, (tx) =>
      tx.update(subscriptions).set(values).where(eq(subscriptions.storeId, storeId)),
    );
  }
}
