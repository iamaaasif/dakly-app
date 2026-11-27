'use client';
import { formatCount } from '@dakly/contracts/money';
import { Button } from '@dakly/ui/button';
import { useToast } from '@dakly/ui/toast';

import { useExportSelectedCustomers } from '../api/export-customers';
import { CustomerBulkTag } from './customer-bulk-tag';

type CustomerBulkBarProps = { contactIds: string[]; onClear: () => void };

// Slides up inside the card while rows are ticked.
export function CustomerBulkBar({ contactIds, onClear }: CustomerBulkBarProps) {
  const showToast = useToast();
  const exportSelected = useExportSelectedCustomers();
  return (
    <div
      role="region"
      aria-label="Selected rows"
      className="motion-rise absolute inset-x-3 bottom-3 z-20 flex items-center gap-2 rounded-lg bg-inverse px-4 py-2 text-on-primary shadow-overlay"
    >
      <p className="mr-auto text-sm font-medium tabular-nums" aria-live="polite">
        {formatCount(contactIds.length)} selected
      </p>
      <CustomerBulkTag contactIds={contactIds} />
      <Button
        variant="link"
        disabled={exportSelected.isPending}
        onClick={() =>
          exportSelected.mutate(contactIds, {
            onSuccess: (rows) => showToast(`Downloaded ${formatCount(rows)} customers.`),
            onError: () => showToast('Could not download the file. Try again.'),
          })
        }
        className="px-3 text-on-primary hover:no-underline"
      >
        Export selected
      </Button>
      <Button variant="link" onClick={onClear} className="px-3 text-on-primary hover:no-underline">
        Clear
      </Button>
    </div>
  );
}
