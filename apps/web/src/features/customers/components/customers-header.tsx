import { Download, Plus } from 'lucide-react';

import type { ContactListQuery } from '@dakly/contracts/contacts';
import { formatCount } from '@dakly/contracts/money';
import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';
import { useToast } from '@dakly/ui/toast';

import { useExportCustomers } from '../api/export-customers';
import { useSessionContext } from '@/lib/session-context';

type CustomersHeaderProps = { query: ContactListQuery; canCreate: boolean; onAdd: () => void };

export function CustomersHeader({ query, canCreate, onAdd }: CustomersHeaderProps) {
  const { data: context } = useSessionContext();
  const exportCustomers = useExportCustomers();
  const showToast = useToast();
  const filters = { kind: query.kind, search: query.search, tag: query.tag };
  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold">All customers</h1>
        <div className="flex flex-wrap items-center gap-2">
          {context?.currentStore?.canExportCustomers ? (
            <Button
              variant="secondary"
              className="gap-2"
              loading={exportCustomers.isPending}
              onClick={() =>
                exportCustomers.mutate(filters, {
                  onSuccess: (count) =>
                    showToast(
                      `Exporting ${formatCount(count)} ${count === 1 ? 'customer' : 'customers'} to Excel. Check your downloads in a moment.`,
                    ),
                })
              }
            >
              <Download aria-hidden="true" size={16} strokeWidth={1.75} /> Export
            </Button>
          ) : null}
          {canCreate ? (
            <Button onClick={onAdd} className="gap-2">
              <Plus aria-hidden="true" size={16} strokeWidth={1.75} /> Add customers
            </Button>
          ) : null}
        </div>
      </div>
      {exportCustomers.error ? (
        <p role="alert" className="text-danger">
          {exportCustomers.error instanceof ApiError
            ? exportCustomers.error.message
            : 'The file could not be downloaded. Try again.'}
        </p>
      ) : null}
    </>
  );
}
