'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@dakly/ui/button';
import { useStaffAlerts } from '../api/alerts';
import { AlertCard } from './alert-card';

export function AlertList() {
  const params = useSearchParams();
  const router = useRouter();
  const list = useStaffAlerts(params.get('alertsBefore') ?? '');
  return (
    <section className="mx-auto max-w-3xl space-y-4 p-4" aria-labelledby="staff-alerts-title">
      <h2 id="staff-alerts-title" className="text-xl font-semibold">
        Break-glass alerts
      </h2>
      <p>Current Super admins can review emergency access and Slack delivery failures here.</p>
      <Button onClick={() => list.refetch()}>Refresh alerts</Button>
      {list.isPending ? <p role="status">Loading alerts…</p> : null}
      {list.error ? <p role="alert">{list.error.message}</p> : null}
      {list.data?.items.length === 0 ? <p>No break-glass alerts.</p> : null}
      {list.data?.items.map((alert) => (
        <AlertCard key={alert.id} alert={alert} />
      ))}
      {list.data?.nextCursor ? (
        <Button onClick={() => router.push(`/?alertsBefore=${list.data!.nextCursor}`)}>
          Older alerts
        </Button>
      ) : null}
    </section>
  );
}
