'use client';
import { type SupportGrantResponse } from '@dakly/contracts/support';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

import { useOwnerDecision } from '../api/owner-decision';
import { ApprovalCode } from './approval-code';
import { formatDateTime } from '@/lib/format-date';

export function OwnerRequest({ grant }: { grant: SupportGrantResponse }) {
  const action = useOwnerDecision();
  return (
    <Card>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{grant.staffName}</h2>
        <p>{grant.reason}</p>
        {grant.isBreakGlass ? (
          <p className="text-danger">
            Break-glass read-only access. No Owner approval was requested.
          </p>
        ) : null}
        <p>
          {grant.access === 'write' ? 'Read and write' : 'Read only'} ·{' '}
          {grant.scopes.map((scope) => scopeLabels[scope] ?? scope).join(', ')} ·{' '}
          {grant.durationMinutes} minutes
        </p>
        <p>
          {grant.status === 'approved'
            ? 'Active support access'
            : `Status: ${statusLabels[grant.status]}`}
        </p>
        {grant.expiresAt ? <p>Ends {formatDateTime(grant.expiresAt)}</p> : null}
        {grant.status === 'requested' ? (
          <>
            <Button
              loading={action.isPending}
              onClick={() => action.mutate({ id: grant.id, action: 'code' })}
            >
              Resend approval code
            </Button>
            <ApprovalCode grant={grant} action={action} />
            <Button
              variant="secondary"
              loading={action.isPending}
              onClick={() => action.mutate({ id: grant.id, action: 'deny' })}
            >
              Deny request
            </Button>
          </>
        ) : null}
        {grant.status === 'approved' ? (
          <Button
            variant="danger"
            loading={action.isPending}
            onClick={() => action.mutate({ id: grant.id, action: 'end' })}
          >
            End now
          </Button>
        ) : null}
        {action.error ? <p role="alert">{action.error.message}</p> : null}
        {action.isSuccess ? <p role="status">{confirmation[action.variables!.action]}</p> : null}
      </div>
    </Card>
  );
}

const confirmation = {
  code: 'Approval code sent to your verified phone.',
  approve: 'Support access approved.',
  deny: 'Support request denied.',
  end: 'Support access ended.',
} as const;

const statusLabels: Record<SupportGrantResponse['status'], string> = {
  requested: 'Requested',
  approved: 'Active',
  denied: 'Denied',
  ended: 'Ended',
  expired: 'Expired',
};

// Scopes are open strings in the response; an unknown one shows as sent.
const scopeLabels: Partial<Record<string, string>> = { customers: 'Customers' };
