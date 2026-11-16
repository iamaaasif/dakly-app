'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useId } from 'react';
import { useForm } from 'react-hook-form';

import {
  type NotificationResponse,
  type NotificationStatus,
  snoozeNotificationSchema,
  type SnoozeNotificationInput,
} from '@dakly/contracts/notifications';
import { Badge, type BadgeProps } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { Input } from '@dakly/ui/input';

import { useMarkNotificationDone } from '../api/mark-notification-done';
import { useMarkNotificationSeen } from '../api/mark-notification-seen';
import { useSnoozeNotification } from '../api/snooze-notification';
import { formatDateTime } from '@/lib/format-date';

const statusBadges: Record<NotificationStatus, { label: string; variant: BadgeProps['variant'] }> =
  {
    new: { label: 'New', variant: 'info' },
    seen: { label: 'Seen', variant: 'neutral' },
    snoozed: { label: 'Snoozed', variant: 'warning' },
    done: { label: 'Done', variant: 'success' },
  };

export function NotificationCard({ notification }: { notification: NotificationResponse }) {
  const badge = statusBadges[notification.status];
  return (
    <Card className="space-y-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold break-words">{notification.title}</h3>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      {notification.body ? <p className="break-words">{notification.body}</p> : null}
      <p className="text-sm text-text-muted">
        {notification.snoozedUntil && notification.status === 'snoozed'
          ? `Snoozed until ${formatDateTime(notification.snoozedUntil)}`
          : formatDateTime(notification.createdAt)}
      </p>
      {notification.actionUrl ? (
        <Link
          href={notification.actionUrl}
          className="inline-flex min-h-10 items-center text-action underline"
        >
          Open
        </Link>
      ) : null}
      {notification.status === 'done' ? null : <NotificationActions notification={notification} />}
    </Card>
  );
}

function NotificationActions({ notification }: { notification: NotificationResponse }) {
  const seen = useMarkNotificationSeen(notification.id);
  const done = useMarkNotificationDone(notification.id);
  const snooze = useSnoozeNotification(notification.id);
  const error = seen.error ?? done.error ?? snooze.error;
  const pending = seen.isPending || done.isPending || snooze.isPending;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        {notification.status === 'new' ? (
          <Button variant="secondary" disabled={pending} onClick={() => seen.mutate()}>
            Mark seen
          </Button>
        ) : null}
        <Button variant="secondary" disabled={pending} onClick={() => done.mutate()}>
          Done
        </Button>
        <details>
          <summary className="inline-flex min-h-10 cursor-pointer items-center rounded-md px-2 text-action underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            Snooze
          </summary>
          <SnoozeForm pending={pending} onSnooze={(input) => snooze.mutate(input)} />
        </details>
      </div>
      {error ? (
        <p role="alert" className="text-danger">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}

type SnoozeFormProps = {
  pending: boolean;
  onSnooze: (input: SnoozeNotificationInput) => void;
};
function SnoozeForm({ pending, onSnooze }: SnoozeFormProps) {
  const id = useId();
  const form = useForm<SnoozeNotificationInput>({
    resolver: zodResolver(snoozeNotificationSchema),
    defaultValues: { until: '' },
  });
  const error = form.formState.errors.until;
  return (
    <form method="post" className="mt-2 space-y-2" onSubmit={form.handleSubmit(onSnooze)}>
      <label htmlFor={id} className="block font-medium">
        Snooze until
      </label>
      <Input
        id={id}
        type="datetime-local"
        required
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        // datetime-local has no zone, so the browser reads it as local time and sends UTC.
        {...form.register('until', {
          setValueAs: (value: string) => (value ? new Date(value).toISOString() : value),
        })}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-danger">
          {error.message}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" loading={pending}>
        Snooze
      </Button>
    </form>
  );
}
