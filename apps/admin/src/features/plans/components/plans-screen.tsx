'use client';
import Link from 'next/link';

import type { StaffIdentity } from '@dakly/contracts/staff-auth';
import { Skeleton } from '@dakly/ui/skeleton';

import { usePlans } from '../api/plans';
import { PlanCard } from './plan-card';

const editRoles: StaffIdentity['role'][] = ['super_admin', 'finance'];

export function PlansScreen({ role }: { role: StaffIdentity['role'] }) {
  const plans = usePlans();
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <Link href="/" className="text-action underline">
        Staff home
      </Link>
      <h1 className="text-xl font-semibold">Plans and prices</h1>
      <p className="text-muted">
        A change applies to new sign-ups and to renewals. Shops already paying keep the price on
        their current period. Each change needs a reason and is written to the staff audit log
        first.
      </p>
      {plans.isPending ? <Skeleton className="h-40 w-full" /> : null}
      {plans.error ? <p role="alert">{plans.error.message}</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {plans.data?.plans.map((plan) => (
          <PlanCard key={plan.code} plan={plan} canEdit={editRoles.includes(role)} />
        ))}
      </div>
    </main>
  );
}
