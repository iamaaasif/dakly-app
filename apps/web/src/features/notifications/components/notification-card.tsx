'use client';
import Link from 'next/link';

import type { NotificationResponse, NotificationStatus } from '@dakly/contracts/notifications';
import { Badge, type BadgeProps } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

import { useMarkNotificationDone } from '../api/mark-notification-done';
import { useMarkNotificationSeen } from '../api/mark-notification-seen';
import { useSnoozeNotification } from '../api/snooze-notification';
import { formatDateTime } from '@/lib/format-date';

const HOUR_MS = 60 * 60 * 1000;
const snoozeChoices = [
  { label: '1 hour', durationMs: HOUR_MS },
  { label: '1 day', durationMs: 24 * HOUR_MS },
  { label: '1 week', durationMs: 7 * 24 * HOUR_MS },
];
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
          <div className="mt-2 flex flex-wrap gap-2">
            {snoozeChoices.map(({ label, durationMs }) => (
              <Button
                key={label}
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  snooze.mutate({ until: new Date(Date.now() + durationMs).toISOString() })
                }
              >
                {`Snooze ${label}`}
              </Button>
            ))}
          </div>
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
