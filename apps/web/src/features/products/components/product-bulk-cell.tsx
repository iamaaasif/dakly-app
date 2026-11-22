import { useFormContext, useWatch } from 'react-hook-form';

import type { BulkEditField, ProductBulkEditFormValues } from '@dakly/contracts/product-bulk-edits';
import type { ProductResponse } from '@dakly/contracts/products';
import { cn } from '@dakly/ui/cn';
import { TableCell } from '@dakly/ui/table';

import { currentValue, displayValue, editableValue } from '../product-bulk-edit';

type ProductBulkCellProps = {
  product: ProductResponse;
  index: number;
  field: BulkEditField;
  label: string;
  disabled?: boolean;
  autoFocus?: boolean;
};

const controlClass =
  'min-h-9 w-full min-w-20 rounded-md border border-input-border bg-surface px-2 py-1 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-invalid:border-danger';

export function ProductBulkCell({ product, index, field, label, ...rest }: ProductBulkCellProps) {
  const before = currentValue(product, field);
  if (rest.disabled)
    return (
      <TableCell>
        <span className="text-text-muted">{displayValue(field, before)}</span>
      </TableCell>
    );
  return (
    <TableCell className="align-middle">
      <CellControl
        name={`rows.${index}.${field}`}
        field={field}
        before={before}
        label={`${label} for ${product.name}`}
        autoFocus={rest.autoFocus}
      />
    </TableCell>
  );
}

type CellControlProps = {
  name: `rows.${number}.${BulkEditField}`;
  field: BulkEditField;
  before: number | string | null;
  label: string;
  autoFocus?: boolean;
};

function CellControl({ name, field, before, label, autoFocus }: CellControlProps) {
  const { register, formState } = useFormContext<ProductBulkEditFormValues>();
  const typed = useWatch<ProductBulkEditFormValues>({ name });
  const changed = Boolean(typed) && String(typed) !== editableValue(field, before);
  const error = formState.errors.rows?.[Number(name.split('.')[1])]?.[field];
  const className = cn(controlClass, changed && 'font-bold');
  return (
    <>
      <div className="flex items-center gap-1.5">
        {changed ? (
          <span className="whitespace-nowrap text-text-muted tabular-nums">
            {displayValue(field, before)} →
          </span>
        ) : null}
        {field === 'status' ? (
          <select aria-label={label} className={className} {...register(name)}>
            <option value="active">Selling</option>
            <option value="hidden">Hidden</option>
          </select>
        ) : (
          <input
            aria-label={label}
            aria-invalid={Boolean(error)}
            inputMode={field === 'category' ? 'text' : 'decimal'}
            className={className}
            autoFocus={autoFocus}
            {...register(name)}
          />
        )}
      </div>
      {error?.message ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {String(error.message)}
        </p>
      ) : null}
    </>
  );
}
