'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { Card } from '@dakly/ui/card';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useAuditLog } from '../api/audit-log';
import { actionLabel, actorLabel } from './audit-labels';
import { formatDateTime } from '@/lib/format-date';

export function AuditLogScreen() {
  const before = useSearchParams().get('before') ?? '';
  const log = useAuditLog(before);
  return (
    <main className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">Activity log</h1>
        <p className="mt-1 text-sm text-text-muted">
          Who changed what in your shop, newest first. Only the Owner can see this.
        </p>
      </div>
      {log.isPending ? <Skeleton className="h-48 w-full max-w-3xl" /> : null}
      {log.error ? (
        <QueryError message={log.error.message} onRetry={() => void log.refetch()} />
      ) : null}
      {log.data?.items.length === 0 ? <p role="status">No activity yet.</p> : null}
      <ol className="max-w-3xl space-y-3">
        {log.data?.items.map((item) => (
          <li key={item.id}>
            <Card className="space-y-1 p-4">
              <h2 className="font-semibold">{actionLabel(item.action)}</h2>
              <p className="text-sm text-text-muted">
                {actorLabel(item.actor)} · {formatDateTime(item.createdAt)}
              </p>
              {item.changedFields.length > 0 ? (
                <p className="text-sm">Changed: {item.changedFields.join(', ')}</p>
              ) : null}
              {item.reason ? <p className="text-sm">Reason: {item.reason}</p> : null}
            </Card>
          </li>
        ))}
      </ol>
      <nav aria-label="Activity pages" className="flex gap-4">
        {before ? (
          <Link
            className="inline-flex min-h-10 items-center text-action underline"
            href="/activity"
          >
            Latest activity
          </Link>
        ) : null}
        {log.data?.nextCursor ? (
          <Link
            className="inline-flex min-h-10 items-center text-action underline"
            href={`/activity?before=${log.data.nextCursor}`}
          >
            Older activity
          </Link>
        ) : null}
      </nav>
    </main>
  );
}
