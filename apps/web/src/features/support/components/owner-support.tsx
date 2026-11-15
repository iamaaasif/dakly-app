'use client';
import { useSearchParams, useRouter } from 'next/navigation';

import { Button } from '@dakly/ui/button';

import { useOwnerSupport } from '../api/support';
import { OwnerRequest } from './owner-request';

export function OwnerSupport() {
  const params = useSearchParams();
  const router = useRouter();
  const list = useOwnerSupport(params.get('before') ?? '');
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4">
      <h1 className="text-xl font-semibold">Support access</h1>
      <p>
        Only the current Owner can approve, deny or end support access. Approval requires the code
        sent to your verified phone.
      </p>
      <Button onClick={() => list.refetch()}>Refresh requests</Button>
      {list.isPending ? <p role="status">Loading requests…</p> : null}
      {list.error ? <p role="alert">{list.error.message}</p> : null}
      {list.data?.items.length === 0 ? <p>No support requests.</p> : null}
      {list.data?.nextCursor ? (
        <Button onClick={() => router.push(`/support-access?before=${list.data!.nextCursor!}`)}>
          Next page
        </Button>
      ) : null}
      {list.data?.items.map((grant) => (
        <OwnerRequest key={grant.id} grant={grant} />
      ))}
    </main>
  );
}
