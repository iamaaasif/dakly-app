import { TransferRequest } from './transfer-request';

export function OwnershipEmpty({ canTransfer, cursor }: { canTransfer: boolean; cursor?: string }) {
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
