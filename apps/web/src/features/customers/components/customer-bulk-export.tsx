'use client';
import { formatCount } from '@dakly/contracts/money';
import { Button } from '@dakly/ui/button';
import { useToast } from '@dakly/ui/toast';

import { useExportSelectedCustomers } from '../api/export-customers';

export function CustomerBulkExport({ contactIds }: { contactIds: string[] }) {
  const showToast = useToast();
  const exportSelected = useExportSelectedCustomers();
  return (
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
  );
}
