import { formatMoney } from '@dakly/contracts/money';
import type {
  ProductImportDryRunResult,
  ProductImportDryRunRow,
  ProductImportMapping,
} from '@dakly/contracts/product-imports';
import { Badge } from '@dakly/ui/badge';
import { cn } from '@dakly/ui/cn';
import { Input } from '@dakly/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dakly/ui/table';

import { productImportFields } from '../product-import-fields';

const resultBadge = {
  added: { label: 'Added', variant: 'success' },
  changed: { label: 'Changed', variant: 'info' },
  skipped: { label: 'Skipped', variant: 'neutral' },
  rejected: { label: 'Rejected', variant: 'danger' },
} as const satisfies Record<ProductImportDryRunResult, { label: string; variant: string }>;

type Column = { key: string; label: string };

// The fields the file brings, then its options, under the names the owner sees.
export function dryRunColumns(mapping: ProductImportMapping): Column[] {
  return [
    ...productImportFields.flatMap(({ field, label }) =>
      mapping[field] === undefined || field === 'description' || field === 'status'
        ? []
        : [{ key: field, label: label.replace(' (taka)', '') }],
    ),
    ...mapping.options.map(({ name }) => ({ key: `option:${name}`, label: name })),
  ];
}

type ProductImportDryRunTableProps = {
  rows: ProductImportDryRunRow[];
  columns: Column[];
  edits: Map<string, string>;
  onEdit: (rowNumber: number, key: string, value: string) => void;
};

export function ProductImportDryRunTable({
  rows,
  columns,
  edits,
  onEdit,
}: ProductImportDryRunTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Row</TableHead>
          <TableHead>Result</TableHead>
          {columns.map(({ key, label }) => (
            <TableHead key={key}>{label}</TableHead>
          ))}
          <TableHead>Problem</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={row.rowNumber}
            className={cn(row.result === 'rejected' && 'bg-danger-soft')}
          >
            <TableCell className="tabular-nums">{row.rowNumber}</TableCell>
            <TableCell>
              <Badge variant={resultBadge[row.result].variant}>
                {resultBadge[row.result].label}
              </Badge>
            </TableCell>
            {columns.map(({ key, label }) => (
              <TableCell key={key}>
                <Input
                  aria-label={`${label}, row ${row.rowNumber}`}
                  className="min-w-24 tabular-nums"
                  value={edits.get(`${row.rowNumber}:${key}`) ?? row.cells[key] ?? ''}
                  onChange={(event) => onEdit(row.rowNumber, key, event.target.value)}
                />
                {key === 'price' && row.wasPricePoisha !== null ? (
                  <span className="text-xs text-text-muted">
                    was {formatMoney(row.wasPricePoisha)}
                  </span>
                ) : null}
              </TableCell>
            ))}
            <TableCell className={cn(row.result === 'rejected' && 'text-danger')}>
              {row.problem}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
