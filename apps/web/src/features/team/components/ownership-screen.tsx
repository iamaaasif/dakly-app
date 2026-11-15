'use client';
import Link from 'next/link';
import { Button } from '@dakly/ui/button';
import { useSessionContext } from '@/lib/session-context';
import { useCurrentTransfer } from '../api/current-transfer';
import { TeamLoading } from './team-loading';
import { TransferRequest } from './transfer-request';
import { TransferStatus } from './transfer-status';
export function OwnershipScreen({ cursor }: { cursor?: string }) {
  const session = useSessionContext();
  const current = useCurrentTransfer();
  if (current.isPending) return <TeamLoading />;
  let content = (
    <OwnershipEmpty
      canTransfer={Boolean(session.data?.currentStore?.canTransferOwnership)}
      cursor={cursor}
    />
  );
  if (current.data?.transfer) content = <TransferStatus transfer={current.data.transfer} />;
  if (current.error)
    content = (
      <div role="alert">
        <p>{current.error.message}</p>
        <Button onClick={() => void current.refetch()}>Check again</Button>
      </div>
    );
  return (
    <main className="space-y-6 p-4 md:p-8">
      <h1 className="text-xl font-bold">Ownership transfer</h1>
      {session.data?.currentStore?.canViewTeam ? (
        <Link href="/team" className="inline-flex min-h-10 items-center text-action underline">
          Team members
        </Link>
      ) : null}
      {content}
    </main>
  );
}
function OwnershipEmpty({ canTransfer, cursor }: { canTransfer: boolean; cursor?: string }) {
  return (
    <section className="space-y-4">
      <p role="status">No pending ownership transfer.</p>
      {canTransfer ? (
        <TransferRequest cursor={cursor} />
      ) : (
        <p>
          Only the current Owner can start a transfer. If you are selected, return here to accept.
        </p>
      )}
    </section>
  );
}
