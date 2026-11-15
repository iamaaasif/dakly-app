'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { staffAlertRetrySchema, type StaffAlert } from '@dakly/contracts/break-glass';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { Input } from '@dakly/ui/input';

import { useRetryAlert } from '../api/alerts';
import { formatDate } from '@/lib/format-date';

export function AlertCard({ alert }: { alert: StaffAlert }) {
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
