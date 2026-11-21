'use client';
import type { ReconciliationLine } from '@dakly/contracts/admin-reconciliation';
import { formatMoney } from '@dakly/contracts/money';
import { Badge } from '@dakly/ui/badge';
import { Card } from '@dakly/ui/card';

import { LineForm } from './line-form';

const gatewayNames = { bkash: 'bKash', nagad: 'Nagad', city_bank: 'City Bank' } as const;

export function LineCard({ line, canEdit }: { line: ReconciliationLine; canEdit: boolean }) {
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{gatewayNames[line.gateway]}</h2>
        <Badge>{line.status === 'escalated' ? 'Escalated' : 'Unmatched'}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-1">
        <dt className="text-muted">Transaction</dt>
        <dd className="break-all">{line.gatewayTransactionId}</dd>
        <dt className="text-muted">Amount</dt>
        <dd>{formatMoney(line.amountPoisha)}</dd>
        <dt className="text-muted">Fee</dt>
        <dd>{formatMoney(line.feePoisha)}</dd>
        <dt className="text-muted">Report date</dt>
        <dd>{line.settlementDate}</dd>
      </dl>
      {line.note ? <p className="text-muted">Note: {line.note}</p> : null}
      {canEdit ? <LineForm lineId={line.id} /> : null}
    </Card>
  );
}
