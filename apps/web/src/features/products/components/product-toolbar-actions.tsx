'use client';
import { Columns3, Download } from 'lucide-react';
import Link from 'next/link';

import { formatCount } from '@dakly/contracts/money';
import type { ProductExportQuery } from '@dakly/contracts/product-imports';
import type { ProductListQuery } from '@dakly/contracts/products';
import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@dakly/ui/dropdown-menu';
import { useToast } from '@dakly/ui/toast';

import { useExportProducts } from '../api/export-products';
import { type ProductColumn, productColumnLabels, productColumns } from '../product-columns';

type ProductToolbarActionsProps = {
  query: ProductListQuery;
  columns: ProductColumn[];
  onToggleColumn: (column: ProductColumn, on: boolean) => void;
  onImport?: () => void;
};

function useExportAs(query: ProductListQuery) {
  const exportProducts = useExportProducts();
  const showToast = useToast();
  const exportAs = (format: ProductExportQuery['format']) =>
    exportProducts.mutate(
      { search: query.search, readiness: query.readiness, format },
      {
        onSuccess: (rows) =>
          showToast(
            `Exported ${formatCount(rows)} ${rows === 1 ? 'row' : 'rows'}. Check your downloads in a moment.`,
          ),
        onError: (error) =>
          showToast(
            error instanceof ApiError
              ? error.message
              : 'The file could not be downloaded. Try again.',
          ),
      },
    );
  return { exportAs, exporting: exportProducts.isPending };
}

export function ProductToolbarActions({
  query,
  columns,
  onToggleColumn,
  onImport,
}: ProductToolbarActionsProps) {
  const { exportAs, exporting } = useExportAs(query);
  return (
    <div className="flex shrink-0 items-center gap-2">
      {onImport ? (
        <Button variant="secondary" className="gap-2" onClick={onImport}>
          <Download aria-hidden="true" size={16} strokeWidth={1.75} /> Import
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Table settings"
          className="inline-grid size-10 place-items-center rounded-md border border-input-border bg-surface text-text hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-[state=open]:bg-surface-muted"
        >
          <Columns3 aria-hidden="true" size={16} strokeWidth={1.75} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {productColumns.map((column) => (
            <DropdownMenuCheckboxItem
              key={column}
              checked={columns.includes(column)}
              onCheckedChange={(on) => onToggleColumn(column, on)}
            >
              {productColumnLabels[column]}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={exporting} onSelect={() => exportAs('xlsx')}>
            Export to Excel
          </DropdownMenuItem>
          <DropdownMenuItem disabled={exporting} onSelect={() => exportAs('csv')}>
            Export to CSV
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/products/lists">Categories and brands</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
