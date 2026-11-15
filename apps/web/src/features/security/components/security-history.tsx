'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import type { AccountSecurityHistoryPage } from '@dakly/contracts/account-security-events';
import { Card } from '@dakly/ui/card';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useSecurityHistory } from '../api/security-history';
import { formatDateTime } from '@/lib/format-date';

export function SecurityHistory() {
  const before = useSearchParams().get('before') ?? '';
  const history = useSecurityHistory(before);
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Security history</h2>
      {history.isPending ? <Skeleton className="h-24 w-full" /> : null}
      {history.error ? (
        <QueryError message={history.error.message} onRetry={() => void history.refetch()} />
      ) : null}
      {history.data?.items.length === 0 ? <p>No security events yet.</p> : null}
      {history.data?.items.map((item) => (
        <Card key={item.id} className="space-y-2">
          <h2 className="font-semibold">
            {item.event === 'recovery.completed' && item.actorType === 'staff'
              ? 'Recovered by Dakly support'
              : eventLabels[item.event]}
          </h2>
          <p>{formatDateTime(item.createdAt)}</p>
          {item.reasonType ? <p>Reason: {reasonLabels[item.reasonType]}</p> : null}
        </Card>
      ))}
      {history.data?.nextCursor ? (
        <Link
          className="text-action underline"
          href={'/security?tab=history&before=' + history.data.nextCursor}
        >
          Older events
        </Link>
      ) : null}
      {before ? (
        <Link className="text-action underline" href="/security?tab=history">
          Latest events
        </Link>
      ) : null}
    </section>
  );
}

type HistoryItem = AccountSecurityHistoryPage['items'][number];

const eventLabels: Record<HistoryItem['event'], string> = {
  'password.changed': 'Password changed',
  'totp.enabled': 'Two-step verification turned on',
  'totp.disabled': 'Two-step verification turned off',
  'recovery.started': 'Account recovery started',
  'recovery.cancelled': 'Account recovery cancelled',
  'recovery.completed': 'Account recovered',
  'email.changed': 'Email changed',
  'phone.changed': 'Mobile number changed',
  'sessions.revoked': 'Devices signed out',
  'google.linked': 'Google account linked',
};

const reasonLabels: Record<NonNullable<HistoryItem['reasonType']>, string> = {
  lost_phone: 'Lost phone',
  lost_authenticator: 'Lost authenticator app',
  lost_email: 'Lost access to email',
};
