'use client';
import { formatCount } from '@dakly/contracts/money';
import { Button } from '@dakly/ui/button';

import { CustomerBulkCampaign } from './customer-bulk-campaign';
import { CustomerBulkExport } from './customer-bulk-export';
import { CustomerBulkSegment } from './customer-bulk-segment';
import { CustomerBulkTag } from './customer-bulk-tag';
import { useSessionContext } from '@/lib/session-context';

type CustomerBulkBarProps = { contactIds: string[]; onClear: () => void };

// Slides up inside the card while rows are ticked. Each action shows only for a member who may
// do it.
export function CustomerBulkBar({ contactIds, onClear }: CustomerBulkBarProps) {
  const store = useSessionContext().data?.currentStore;
  const { canCreateCustomer, canEditSegments, canEditCampaigns, canExportCustomers } = store ?? {};
  return (
    <div
      role="region"
      aria-label="Selected rows"
      className="motion-rise absolute inset-x-3 bottom-3 z-20 flex items-center gap-2 rounded-lg bg-inverse px-4 py-2 text-on-primary shadow-overlay"
    >
      <p className="mr-auto text-sm font-medium tabular-nums" aria-live="polite">
        {formatCount(contactIds.length)} selected
      </p>
      {canCreateCustomer ? <CustomerBulkTag contactIds={contactIds} /> : null}
      {canEditSegments ? <CustomerBulkSegment contactIds={contactIds} /> : null}
      {canEditSegments && canEditCampaigns ? (
        <CustomerBulkCampaign contactIds={contactIds} />
      ) : null}
      {canExportCustomers ? <CustomerBulkExport contactIds={contactIds} /> : null}
      <Button variant="link" onClick={onClear} className="px-3 text-on-primary hover:no-underline">
        Clear
      </Button>
    </div>
  );
}
