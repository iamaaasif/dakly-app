'use client';
import Link from 'next/link';
import { useState } from 'react';

import type { StaffIdentity } from '@dakly/contracts/staff-auth';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { Skeleton } from '@dakly/ui/skeleton';

import { usePlans } from '../api/plans';
import { NewPlanForm } from './new-plan-form';
import { PlanCard } from './plan-card';

const editRoles: StaffIdentity['role'][] = ['super_admin', 'finance'];

export function PlansScreen({ role }: { role: StaffIdentity['role'] }) {
  const plans = usePlans();
  const [creating, setCreating] = useState(false);
  const canEdit = editRoles.includes(role);
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
      {canEdit && !creating ? (
        <Button type="button" onClick={() => setCreating(true)}>
          New plan
        </Button>
      ) : null}
      {creating ? (
        <Card className="space-y-3 p-4">
          <h2 className="text-lg font-semibold">New plan</h2>
          <NewPlanForm onDone={() => setCreating(false)} />
        </Card>
      ) : null}
      {plans.isPending ? <Skeleton className="h-40 w-full" /> : null}
      {plans.error ? <p role="alert">{plans.error.message}</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {plans.data?.plans.map((plan) => (
          <PlanCard key={plan.code} plan={plan} canEdit={canEdit} />
        ))}
      </div>
    </main>
  );
}
