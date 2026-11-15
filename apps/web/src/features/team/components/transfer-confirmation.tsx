import { Button } from '@dakly/ui/button';
import { SessionDialog as Dialog } from '@/components/session-dialog';
import { useCancelTransfer } from '../api/cancel-transfer';
import { useAcceptTransfer } from '../api/accept-transfer';
import { TeamError } from './team-error';
type TransferConfirmationProps = {
  action: 'accept' | 'cancel';
  transferId: string;
  shopName: string;
  onClose: () => void;
};
export function TransferConfirmation({
  action,
  transferId,
  shopName,
  onClose,
}: TransferConfirmationProps) {
  const cancel = useCancelTransfer(transferId);
  const accept = useAcceptTransfer();
  return (
    <Dialog
      open
      title={
        action === 'accept'
          ? `Become Owner of ${shopName}?`
          : `Cancel ownership transfer for ${shopName}?`
      }
      onClose={onClose}
    >
      <p className="mb-4">
        Only the named recipient can accept. The shop always keeps exactly one Owner.
      </p>
      <TeamError message={accept.error?.message ?? cancel.error?.message} />
      <Button
        variant={action === 'cancel' ? 'danger' : 'primary'}
        loading={accept.isPending || cancel.isPending}
        onClick={() => {
          if (action === 'accept') accept.mutate({ transferId });
          else cancel.mutate();
        }}
      >
        {action === 'accept' ? 'Accept ownership' : 'Confirm cancellation'}
      </Button>
    </Dialog>
  );
}
