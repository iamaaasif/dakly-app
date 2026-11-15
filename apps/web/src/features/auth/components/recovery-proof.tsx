import type { TotpRecoveryResponse } from '@dakly/contracts/totp';

import { formatDateTime } from '@/lib/format-date';

export function RecoveryProof({ proof }: { proof: TotpRecoveryResponse }) {
  return (
    <div className="space-y-4">
      <p role="status">
        Recovery requested. Keep both details below somewhere safe. They are shown only on this page
        and are cleared when you leave or reload.
      </p>
      <p>
        {proof.eligibleAt
          ? `You can try to complete recovery after ${formatDateTime(proof.eligibleAt)}.`
          : 'Recovery is waiting for delivery of all security notices. The seven-day wait begins after delivery.'}
      </p>
      <p>
        Use these details with “Complete a recovery” after the waiting period. The cancellation link
        in your notice cannot complete recovery.
      </p>
      <dl className="space-y-2">
        <dt className="font-semibold">Recovery reference</dt>
        <dd className="break-all" data-private>
          {proof.recoveryId}
        </dd>
        <dt className="font-semibold">Completion key</dt>
        <dd className="break-all" data-private>
          {proof.completionToken}
        </dd>
      </dl>
    </div>
  );
}
