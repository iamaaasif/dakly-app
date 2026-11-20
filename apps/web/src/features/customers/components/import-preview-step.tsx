import { useFormContext } from 'react-hook-form';

import type { StartImportInput } from '@dakly/contracts/contacts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dakly/ui/table';

import { importFields } from '../import-fields';
import type { ImportFileSummary } from '../import-file';
import { ImportStepActions } from './import-step-actions';

type ImportPreviewStepProps = {
  preview: ImportFileSummary;
  onBack: () => void;
  onNext: () => void;
};

export function ImportPreviewStep({ preview, onBack, onNext }: ImportPreviewStepProps) {
  const { watch } = useFormContext<StartImportInput>();
  const mapping = watch('mapping');
  const columns = importFields.flatMap(({ field, label }) => {
    const column = mapping[field];
    return column === undefined ? [] : [{ field, label, column }];
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        The first {preview.rows.length} of {preview.rowCount} rows, as Dakly will read them.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map(({ field, label }) => (
              <TableHead key={field}>{label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {preview.rows.map((cells, index) => (
            <TableRow key={index}>
              {columns.map(({ field, column }) => (
                <TableCell key={field} className="max-w-48 truncate tabular-nums">
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
