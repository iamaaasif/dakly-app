import { Download } from 'lucide-react';

import { formatCount } from '@dakly/contracts/money';
import type { OrderListQuery } from '@dakly/contracts/orders';
import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@dakly/ui/dropdown-menu';

import { useExportOrders } from '../api/export-orders';

export function OrderExportMenu({ query }: { query: OrderListQuery }) {
  const filters = { ...query, cursor: undefined, limit: undefined };
  const download = useExportOrders();
  return (
    <div className="flex flex-col items-start gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            className="min-h-11 gap-2 sm:min-h-10"
            aria-busy={download.isPending}
          >
            <Download aria-hidden="true" size={16} />
            {download.isPending ? 'Exporting…' : 'Export'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            disabled={download.isPending}
            onSelect={() => download.mutate({ ...filters, format: 'csv' })}
          >
            CSV
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={download.isPending}
            onSelect={() => download.mutate({ ...filters, format: 'xlsx' })}
          >
            Excel (.xlsx)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {download.data !== undefined ? (
        <p role="status" className="text-sm text-text-muted">
          {`Exported ${formatCount(download.data)} ${download.data === 1 ? 'row' : 'rows'}.`}
        </p>
      ) : null}
      {download.error ? (
        <p role="alert" className="text-sm text-danger">
          {download.error instanceof ApiError
            ? download.error.message
            : 'The file could not be downloaded. Try again.'}
        </p>
      ) : null}
    </div>
  );
}
