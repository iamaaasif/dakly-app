'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { Skeleton } from '@dakly/ui/skeleton';
import { formatDateTime } from '@/lib/format-date';
import { useSecurityHistory } from '../api/security-history';
export function SecurityHistory() {
  const before = useSearchParams().get('before') ?? '';
  const history = useSecurityHistory(before);
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 md:p-8">
      <Link href="/" className="text-action underline">
        Home
      </Link>
      <h1 className="text-2xl font-semibold">Security history</h1>
      {history.isPending ? <Skeleton className="h-24 w-full" /> : null}
      {history.error ? (
        <div>
          <p role="alert">{history.error.message}</p>
          <Button onClick={() => history.refetch()}>Retry</Button>
        </div>
      ) : null}
      {history.data?.items.length === 0 ? <p>No security events yet.</p> : null}
      {history.data?.items.map((item) => (
        <Card key={item.id} className="space-y-2">
          <h2 className="font-semibold">
            {item.event === 'recovery.completed' && item.actorType === 'staff'
              ? 'Recovered by Dakly support'
              : item.event.replaceAll('.', ' ').replaceAll('_', ' ')}
          </h2>
          <p>{formatDateTime(item.createdAt)}</p>
          {item.reasonType ? <p>Reason: {item.reasonType.replaceAll('_', ' ')}</p> : null}
        </Card>
      ))}
      {history.data?.nextCursor ? (
        <Link
          className="text-action underline"
          href={'/security?before=' + history.data.nextCursor}
        >
          Older events
        </Link>
      ) : null}
      {before ? (
        <Link className="text-action underline" href="/security">
          Latest events
        </Link>
      ) : null}
    </main>
  );
}
