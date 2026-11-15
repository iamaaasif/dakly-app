'use client';
import Link from 'next/link';
import { QueryError } from '@dakly/ui/query-error';
import { useSessionContext } from '@/lib/session-context';
import { useCurrentTransfer } from '../api/current-transfer';
import { TeamLoading } from './team-loading';
import { TransferStatus } from './transfer-status';
import { OwnershipEmpty } from './ownership-empty';
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
      <QueryError
        message={current.error.message}
        onRetry={() => void current.refetch()}
        retryLabel="Check again"
      />
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
