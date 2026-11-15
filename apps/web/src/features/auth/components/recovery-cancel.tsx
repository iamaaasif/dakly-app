import type { TotpRecoveryTokenInput } from '@dakly/contracts/totp';
import { Button } from '@dakly/ui/button';

import { useCancelRecovery } from '../api/cancel-recovery';

export function RecoveryCancel({ notice }: { notice: TotpRecoveryTokenInput }) {
  const cancel = useCancelRecovery();
  if (cancel.isSuccess)
    return (
      <p role="status">
        The cancellation request was accepted. Pending recovery has been cancelled. A completed
        recovery cannot be undone with this link.
      </p>
    );
  return (
    <div className="space-y-4">
      <p>
        Cancel the two-step verification recovery request in your security notice? Opening this page
        does not change your account.
      </p>
      <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate(notice)}>
        Cancel this recovery request
      </Button>
      {cancel.error ? (
        <p role="alert" className="text-danger">
          {cancel.error.message}
        </p>
      ) : null}
    </div>
  );
}
