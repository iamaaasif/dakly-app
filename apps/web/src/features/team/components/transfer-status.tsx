import { useState } from 'react';
import type { OwnershipTransferResponse } from '@dakly/contracts/team';
import { Button } from '@dakly/ui/button';
import { TransferConfirmation } from './transfer-confirmation';
import { formatDateTime } from '@/lib/format-date';
import { useSessionContext } from '@/lib/session-context';
export function TransferStatus({ transfer }: { transfer: OwnershipTransferResponse }) {
  const { data } = useSessionContext();
  const [confirm, setConfirm] = useState<'accept' | 'cancel' | null>(null);
  const isRecipient = transfer.newOwnerUserId === data?.user.id;
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Pending ownership transfer</h2>
      <p>
        Expires <time dateTime={transfer.expiresAt}>{formatDateTime(transfer.expiresAt)}</time>.
      </p>
      {isRecipient ? (
        <>
          <p>
            You are the named recipient. Accepting makes you the only Owner and gives the previous
            Owner the Admin role.
          </p>
          <Button onClick={() => setConfirm('accept')}>Review acceptance</Button>
        </>
      ) : (
        <>
          <p>Ask the selected member to open Ownership transfer from their shop’s navigation.</p>
          <p className="text-sm break-all">Recipient account: {transfer.newOwnerUserId}</p>
        </>
      )}
      {data?.currentStore?.canTransferOwnership ? (
        <Button variant="danger" onClick={() => setConfirm('cancel')}>
          Cancel transfer
        </Button>
      ) : null}
      {confirm ? (
        <TransferConfirmation
          action={confirm}
          transferId={transfer.id}
          shopName={data?.currentStore?.name ?? 'this shop'}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </section>
  );
}
