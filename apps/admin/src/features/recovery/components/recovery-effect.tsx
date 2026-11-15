import { type StaffRecoveryPreview } from '@dakly/contracts/staff-recovery';

import { formatDate } from '@/lib/format-date';

export function RecoveryEffect({ effect }: { effect: StaffRecoveryPreview['effect'] }) {
  return (
    <>
      <h2 id="recover-title" className="text-lg font-semibold">
        Confirm recovery for {effect.targetName}
      </h2>
      <p className="break-all">Account: {effect.targetId}</p>
      <p>
        {effect.removeTotp ? 'Remove two-step verification and all backup codes. ' : ''}Sign out
        every session immediately.
      </p>
      <p className="break-words">
        Reason: {effect.reasonType.replaceAll('_', ' ')}. {effect.reason}
      </p>
      <p>
        The person and their shop Owners receive security notices. Recovery is recorded in account
        and shop history. Confirm by {formatDate(effect.confirmBy)}.
      </p>
    </>
  );
}
