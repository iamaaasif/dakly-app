import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import { planLimitsSchema } from '@dakly/contracts/billing';
import type { Database } from '@dakly/db/client';
import { plans, subscriptions } from '@dakly/db/schema/billing';

import { DATABASE } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';

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
  ) {}

  async publicPlans(): Promise<Plan[]> {
    const rows = await this.database
      .select(planColumns)
      .from(plans)
      .where(and(eq(plans.kind, 'plan'), eq(plans.isPublic, true)))
      .orderBy(asc(plans.position), asc(plans.code));
    return rows.map((row) => ({ ...row, limits: planLimitsSchema.parse(row.limits) }));
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
