import { forwardRef, type ComponentProps } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import type { BulkEditField, ProductBulkEditFormValues } from '@dakly/contracts/product-bulk-edits';
import type { ProductResponse } from '@dakly/contracts/products';
import { cn } from '@dakly/ui/cn';
import { TableCell } from '@dakly/ui/table';

import {
  categoryOptions,
  useListNames,
  useProductBrands,
  useProductCategories,
} from '../api/get-categories';
import { currentValue, displayValue, editableValue, type ListNames } from '../product-bulk-edit';

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
  const names = useListNames();
  if (rest.disabled)
    return (
      <TableCell>
        <span className="text-text-muted">{displayValue(field, before, names)}</span>
      </TableCell>
    );
  return (
    <TableCell className="align-middle">
      <CellControl
        name={`rows.${index}.${field}`}
        field={field}
        before={before}
        names={names}
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
  names: ListNames;
  label: string;
  autoFocus?: boolean;
};

function CellControl({ name, field, before, names, label, autoFocus }: CellControlProps) {
  const { formState } = useFormContext<ProductBulkEditFormValues>();
  const typed = useWatch<ProductBulkEditFormValues>({ name });
  const changed = Boolean(typed) && String(typed) !== editableValue(field, before);
  const error = formState.errors.rows?.[Number(name.split('.')[1])]?.[field];
  const className = cn(controlClass, changed && 'font-bold');
  return (
    <>
      <div className="flex items-center gap-1.5">
        {changed ? (
          <span className="whitespace-nowrap text-text-muted tabular-nums">
            {displayValue(field, before, names)} →
          </span>
        ) : null}
        <CellInput
          name={name}
          field={field}
          label={label}
          className={className}
          error={Boolean(error)}
          autoFocus={autoFocus}
        />
      </div>
      {error?.message ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {String(error.message)}
        </p>
      ) : null}
    </>
  );
}

type ListSelectProps = ComponentProps<'select'> & {
  field: 'categoryId' | 'brandId';
  label: string;
};

// A product's category or brand is picked from the shop's list; blank keeps what it has.
const ListSelect = forwardRef<HTMLSelectElement, ListSelectProps>(function ListSelect(
  { field, label, ...rest },
  ref,
) {
  const { data: categories } = useProductCategories();
  const { data: brands } = useProductBrands();
  const options =
    field === 'categoryId'
      ? categoryOptions(categories?.items ?? [])
      : (brands?.items ?? []).map(({ id, name }) => ({ value: id, label: name }));
  return (
    <select ref={ref} aria-label={label} {...rest}>
      <option value="">{field === 'categoryId' ? 'No category' : 'No brand'}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
});

type CellInputProps = {
  name: `rows.${number}.${BulkEditField}`;
  field: BulkEditField;
  label: string;
  className: string;
  error: boolean;
  autoFocus?: boolean;
};

function CellInput({ name, field, label, className, error, autoFocus }: CellInputProps) {
  const { register } = useFormContext<ProductBulkEditFormValues>();
  if (field === 'status')
    return (
      <select aria-label={label} className={className} {...register(name)}>
        <option value="active">Selling</option>
        <option value="hidden">Hidden</option>
      </select>
    );
  if (field === 'categoryId' || field === 'brandId')
    return <ListSelect field={field} label={label} className={className} {...register(name)} />;
  return (
    <input
      aria-label={label}
      aria-invalid={error}
      inputMode="decimal"
      className={className}
      autoFocus={autoFocus}
      {...register(name)}
    />
  );
}
