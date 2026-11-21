import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import type { UpdatePlanInput } from '@dakly/contracts/admin-plans';
import { planLimitsSchema } from '@dakly/contracts/billing';
import type { Database } from '@dakly/db/client';
import { staffAuditLog } from '@dakly/db/schema/admin';
import { plans, subscriptions } from '@dakly/db/schema/billing';

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
}
