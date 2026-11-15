import { type BreakGlassPreview } from '@dakly/contracts/break-glass';

import { formatDate } from '@/lib/format-date';

export function EffectDetails({ effect }: { effect: BreakGlassPreview['effect'] }) {
  return (
    <>
      <p className="break-words">Shop: {effect.shopName}</p>
      <p className="break-all">Shop ID: {effect.targetId}</p>
      <p>
        Purpose: {effect.category === 'security_incident' ? 'Security incident' : 'Legal request'}
      </p>
      <p className="break-words">Reason: {effect.reason}</p>
      <p>
        Read customer records by ID only. No changes or Owner approval. The Owner can end access at
        any time.
      </p>
      <p>
        Deadline: {formatDate(effect.expiresAt)}. Thirty minutes from this preview; confirming does
        not extend it.
      </p>
      <p>
        Confirm by {formatDate(effect.confirmBy)}. The action is recorded in staff and shop history
        and alerts other Super admins.
      </p>
    </>
  );
}
