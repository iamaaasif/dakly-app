'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { useForm } from 'react-hook-form';

import { staffAlertRetrySchema, type StaffAlert } from '@dakly/contracts/break-glass';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { Input } from '@dakly/ui/input';

import { useStaffAlerts, useRetryAlert } from '../api/alerts';
import { formatDate } from '@/lib/format-date';

export function StaffAlerts() {
  return (
    <Suspense fallback={<p role="status">Loading staff alerts…</p>}>
      <AlertList />
    </Suspense>
  );
}
function AlertList() {
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
function AlertCard({ alert }: { alert: StaffAlert }) {
  const retry = useRetryAlert();
  const form = useForm<{ reason: string }>({
    resolver: zodResolver(staffAlertRetrySchema),
    defaultValues: { reason: '' },
  });
  return (
    <Card className="space-y-3 break-words">
      <p className="font-semibold">{alert.staffName} opened break-glass access</p>
      <p className="break-all">Shop: {alert.storeId}</p>
      <p>{alert.reason}</p>
      <p>{formatDate(alert.createdAt)}</p>
      <p>
        Slack: {alert.status} · Attempts: {alert.attempts}/5
      </p>
      {alert.error ? <p role="alert">{alert.error}</p> : null}
      {alert.status === 'failed' ? (
        <form
          className="space-y-3"
          onSubmit={form.handleSubmit((input) => retry.mutate({ id: alert.id, ...input }))}
        >
          <p>
            After repairing Slack configuration, request another five attempts. Retry may be
            temporarily unavailable during cooldown.
          </p>
          <label htmlFor={`retry-${alert.id}`}>Retry reason</label>
          <Input id={`retry-${alert.id}`} {...form.register('reason')} />
          {form.formState.errors.reason ? (
            <p role="alert">{form.formState.errors.reason.message}</p>
          ) : null}
          <Button type="submit" loading={retry.isPending}>
            Retry Slack alert
          </Button>
          {retry.error ? <p role="alert">{retry.error.message}</p> : null}
        </form>
      ) : null}
      {retry.isSuccess ? <p role="status">Slack retry queued.</p> : null}
    </Card>
  );
}
