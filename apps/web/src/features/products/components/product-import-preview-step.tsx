import { useFormContext } from 'react-hook-form';

import type { StartProductImportForm } from '@dakly/contracts/product-imports';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dakly/ui/table';

import { productImportFields } from '../product-import-fields';
import { ImportStepActions } from '@/components/import-step-actions';
import type { ImportFileSummary } from '@/lib/import-file';

type ProductImportPreviewStepProps = {
  preview: ImportFileSummary;
  onBack: () => void;
  onNext: () => void;
};

export function ProductImportPreviewStep({
  preview,
  onBack,
  onNext,
}: ProductImportPreviewStepProps) {
  const { watch } = useFormContext<StartProductImportForm>();
  const mapping = watch('mapping');
  const columns = [
    ...productImportFields.flatMap(({ field, label }) => {
      const column = mapping[field];
      return column === undefined ? [] : [{ key: field, label, column }];
    }),
    ...(mapping.options ?? []).map(({ name, column }, index) => ({
      key: `option-${index}`,
      label: name,
      column,
    })),
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        The first {preview.rows.length} of {preview.rowCount} rows, as Dakly will read them.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map(({ key, label }) => (
              <TableHead key={key}>{label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {preview.rows.map((cells, index) => (
            <TableRow key={index}>
              {columns.map(({ key, column }) => (
                <TableCell key={key} className="max-w-48 truncate tabular-nums">
                  {cells[column]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ImportStepActions onBack={onBack} next="Continue" onNext={onNext} />
    </div>
  );
}
