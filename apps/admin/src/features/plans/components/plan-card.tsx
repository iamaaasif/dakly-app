'use client';
import { useState } from 'react';

import type { AdminPlan } from '@dakly/contracts/admin-plans';
import { formatMoney } from '@dakly/contracts/money';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

import { PlanForm } from './plan-form';
import { formatDate } from '@/lib/format-date';

export function PlanCard({ plan, canEdit }: { plan: AdminPlan; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{plan.name}</h2>
        <Badge>{plan.isPublic ? 'Public' : 'Hidden'}</Badge>
      </div>
      {editing ? (
        <PlanForm plan={plan} onDone={() => setEditing(false)} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-1">
            <dt className="text-muted">Monthly</dt>
            <dd>{formatMoney(plan.monthlyPricePoisha)}</dd>
            <dt className="text-muted">Yearly</dt>
            <dd>{formatMoney(plan.yearlyPricePoisha)}</dd>
            <dt className="text-muted">Trial</dt>
            <dd>{plan.trialDays} days</dd>
            {Object.entries(plan.limits).map(([name, value]) => (
              <div key={name} className="contents">
                <dt className="text-muted">{name.replaceAll('_', ' ')}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-muted">Changed {formatDate(plan.updatedAt)}</p>
          {canEdit ? (
            <Button type="button" onClick={() => setEditing(true)}>
              Edit {plan.name}
            </Button>
          ) : null}
        </>
      )}
    </Card>
  );
}
