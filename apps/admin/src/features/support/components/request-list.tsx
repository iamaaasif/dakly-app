'use client';
import { useSearchParams, useRouter } from 'next/navigation';

import { Button } from '@dakly/ui/button';

import { useSupportRequests } from '../api/support';
import { RequestCard } from './request-card';

export function RequestList() {
  const params = useSearchParams();
  const router = useRouter();
  const requests = useSupportRequests(params.get('before') ?? '');
  return (
    <>
      <h2 className="text-lg font-semibold">Your recent requests</h2>
      <Button variant="secondary" onClick={() => requests.refetch()}>
        Refresh requests
      </Button>
      {requests.isPending ? <p role="status">Loading requests…</p> : null}
      {requests.error ? <p role="alert">{requests.error.message}</p> : null}
      {requests.data?.items.length === 0 ? <p>No support requests yet.</p> : null}
      {requests.data?.nextCursor ? (
        <Button
          onClick={() => {
            const query = new URLSearchParams(params);
            query.set('before', requests.data!.nextCursor!);
            router.push(`/support?${query}`);
          }}
        >
          Next page
        </Button>
      ) : null}
      {requests.data?.items.map((grant) => (
        <RequestCard key={grant.id} grant={grant} />
      ))}
    </>
  );
}
