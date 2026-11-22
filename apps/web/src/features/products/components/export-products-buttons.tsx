import { Download } from 'lucide-react';

import { formatCount } from '@dakly/contracts/money';
import type { ProductExportQuery } from '@dakly/contracts/product-imports';
import type { ProductListQuery } from '@dakly/contracts/products';
import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';

import { useExportProducts } from '../api/export-products';

const formats = [
  { format: 'xlsx', label: 'Export to Excel' },
  { format: 'csv', label: 'Export to CSV' },
] as const;

// The file holds the products the filters show, in the columns the import reads.
export function ExportProductsButtons({ query }: { query: ProductListQuery }) {
  const exportProducts = useExportProducts();
  const filters = { search: query.search, readiness: query.readiness };
  const exporting = exportProducts.isPending ? exportProducts.variables.format : undefined;
  return (
    <>
      {formats.map(({ format, label }) => (
        <Button
          key={format}
          variant="secondary"
          className="gap-2"
          loading={exporting === format}
          disabled={exporting !== undefined}
          onClick={() => exportProducts.mutate({ ...filters, format } satisfies ProductExportQuery)}
        >
          <Download aria-hidden="true" size={16} strokeWidth={1.75} /> {label}
        </Button>
      ))}
      {exportProducts.data !== undefined ? (
        <p role="status" className="basis-full text-sm text-text-muted">
          {`Exported ${formatCount(exportProducts.data)} ${exportProducts.data === 1 ? 'row' : 'rows'}. Check your downloads in a moment.`}
        </p>
      ) : null}
      {exportProducts.error ? (
        <p role="alert" className="basis-full text-danger">
          {exportProducts.error instanceof ApiError
            ? exportProducts.error.message
            : 'The file could not be downloaded. Try again.'}
        </p>
      ) : null}
    </>
  );
}
