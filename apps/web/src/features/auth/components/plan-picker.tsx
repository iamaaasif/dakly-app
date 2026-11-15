'use client';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { usePlans } from '../api/plans';
import type { BusinessDraft } from '../auth.types';
import { PlanForm } from './plan-form';

export function PlanPicker({ draft, onBack }: { draft: BusinessDraft; onBack: () => void }) {
  const plans = usePlans();
  if (plans.isPending)
    return (
      <div role="status">
        <p>Loading plans…</p>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  if (plans.error)
    return <QueryError message="Could not load plans." onRetry={() => void plans.refetch()} />;
  if (!plans.data.plans.length)
    return (
      <div className="space-y-4">
        <p>No plans are available yet. Your account is saved; return later to finish setup.</p>
        <Button onClick={() => void plans.refetch()}>Refresh plans</Button>
      </div>
    );
  return <PlanForm draft={draft} onBack={onBack} plans={plans.data} />;
}
