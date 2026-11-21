'use client';
import Link from 'next/link';

import type { StaffIdentity } from '@dakly/contracts/staff-auth';
import { Skeleton } from '@dakly/ui/skeleton';

import { useReconciliationQueue } from '../api/reconciliation';
import { LineCard } from './line-card';

const editRoles: StaffIdentity['role'][] = ['super_admin', 'finance'];

export function ReconciliationScreen({ role }: { role: StaffIdentity['role'] }) {
  const queue = useReconciliationQueue();
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <Link href="/" className="text-action underline">
        Staff home
      </Link>
      <h1 className="text-xl font-semibold">Reconciliation queue</h1>
      <p className="text-muted">
        Lines from the nightly gateway report that no Dakly payment matched. Mark a line as a
        gateway error, or escalate it and keep it here. Each action needs a reason and is written to
        the staff audit log first.
      </p>
      {queue.isPending ? <Skeleton className="h-40 w-full" /> : null}
      {queue.error ? <p role="alert">{queue.error.message}</p> : null}
      {queue.data?.lines.length === 0 ? <p>Nothing to reconcile.</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {queue.data?.lines.map((line) => (
          <LineCard key={line.id} line={line} canEdit={editRoles.includes(role)} />
        ))}
      </div>
    </main>
  );
}
