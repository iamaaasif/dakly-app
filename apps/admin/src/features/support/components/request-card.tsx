'use client';
import type { SupportGrantResponse } from '@dakly/contracts/support';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

import { useOpenSupport } from '../api/support';

export function RequestCard({ grant }: { grant: SupportGrantResponse }) {
  const open = useOpenSupport();
  return (
    <Card>
      <p className="font-semibold">{grant.reason}</p>
      {grant.isBreakGlass ? (
        <p className="text-danger">Break-glass access · no Owner approval</p>
      ) : null}
      <p>
        {statusLabels[grant.status]} · {grant.access === 'write' ? 'Read and write' : 'Read only'} ·{' '}
        {grant.durationMinutes} minutes
      </p>
      <p>Scope: {grant.scopes.map((scope) => scopeLabels[scope] ?? scope).join(', ')}</p>
      {grant.status === 'approved' ? (
        <Button loading={open.isPending} onClick={() => open.mutate(grant.id)}>
          Open support session
        </Button>
      ) : null}
      {open.error ? <p role="alert">{open.error.message}</p> : null}
    </Card>
  );
}

const statusLabels: Record<SupportGrantResponse['status'], string> = {
  requested: 'Requested',
  approved: 'Active',
  denied: 'Denied',
  ended: 'Ended',
  expired: 'Expired',
};

// Scopes are open strings in the response; an unknown one shows as sent.
const scopeLabels: Partial<Record<string, string>> = { customers: 'Customers' };
