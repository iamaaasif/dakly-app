'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form';

import {
  bulkEditStockReasons,
  type BulkEditField,
  type BulkEditStockReason,
  productBulkEditFormSchema,
  type ProductBulkEditFormInput,
  type ProductBulkEditFormValues,
  type ProductBulkEditRow,
} from '@dakly/contracts/product-bulk-edits';
import type { ProductResponse } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dakly/ui/table';

import {
  canEditStock,
  changedRows,
  countChangedValues,
  gridDefaults,
  hasSizePrice,
  onlyVariant,
} from '../product-bulk-edit';
import { ProductBulkCell } from './product-bulk-cell';

type ProductBulkGridProps = {
  products: ProductResponse[];
  preset: 'hide' | 'category' | undefined;
  // Values Ask Dakly AI prepared; they show as changed cells until the owner reviews them.
  proposed?: ProductBulkEditRow[];
  onReview: (rows: ProductBulkEditRow[], stockReason: BulkEditStockReason | '') => void;
  onCancel: () => void;
};

export function ProductBulkGrid({
  products,
  preset,
  proposed,
  onReview,
  onCancel,
}: ProductBulkGridProps) {
  const form = useForm<ProductBulkEditFormValues, unknown, ProductBulkEditFormInput>({
    resolver: zodResolver(productBulkEditFormSchema),
    defaultValues: gridDefaults(products, preset === 'hide' ? 'hide' : undefined, proposed),
  });
  const values = useWatch({ control: form.control });
  const parsed = productBulkEditFormSchema.safeParse(values);
  const rows = parsed.success ? changedRows(parsed.data.rows, products) : [];
  const changed = countChangedValues(rows);
  const stockChanged = rows.some((row) => row.stock !== undefined);

  const submit = (input: ProductBulkEditFormInput) => {
    const toReview = changedRows(input.rows, products);
    if (toReview.some((row) => row.stock !== undefined) && !input.stockReason) {
      form.setError('stockReason', { message: 'Choose a reason for the stock change' });
      return;
    }
    onReview(toReview, input.stockReason);
  };

  return (
    <section
      aria-label={`Edit ${products.length} products`}
      className="space-y-4 rounded-lg border border-border bg-surface p-4 md:p-6"
    >
      <h2 className="text-lg font-semibold text-text">
        Edit {products.length} {products.length === 1 ? 'product' : 'products'}
      </h2>
      <FormProvider {...form}>
        <form className="space-y-4" noValidate onSubmit={form.handleSubmit(submit)}>
          <p className="text-sm text-text-muted md:hidden">
            Swipe sideways to edit Price, Old price, Cost, Stock, Category, Brand and Status.
          </p>
          <GridTable products={products} preset={preset} />
          <p className="text-sm text-text-muted">
            Changed cells are bold. A blank cell never overwrites. Cost and stock are edited on the
            product when it has more than one size.
          </p>
          {stockChanged ? <StockReason /> : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={changed === 0}>
              Review {changed} {changed === 1 ? 'change' : 'changes'}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </FormProvider>
    </section>
  );
}

const columns = [
  { field: 'pricePoisha', label: 'Price' },
  { field: 'compareAtPricePoisha', label: 'Old price' },
  { field: 'costPoisha', label: 'Cost' },
  { field: 'stock', label: 'Stock' },
  { field: 'categoryId', label: 'Category' },
  { field: 'brandId', label: 'Brand' },
  { field: 'status', label: 'Status' },
] as const;

function isDisabled(field: BulkEditField, product: ProductResponse) {
  if (field === 'pricePoisha') return hasSizePrice(product);
  if (field === 'costPoisha') return onlyVariant(product) === undefined;
  return field === 'stock' && !canEditStock(product);
}

function GridTable({ products, preset }: Pick<ProductBulkGridProps, 'products' | 'preset'>) {
  return (
    <Table aria-label="Edit products in a grid">
      <TableHeader>
        <TableRow>
          <TableHead className="sticky left-0 z-10 border-r border-border bg-surface-muted">
            Product
          </TableHead>
          {columns.map(({ label }) => (
            <TableHead key={label}>{label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product, index) => (
          <TableRow key={product.id}>
            <TableCell className="sticky left-0 z-10 min-w-28 border-r border-border bg-surface font-medium md:min-w-40">
              {product.name}
            </TableCell>
            {columns.map(({ field, label }) => (
              <ProductBulkCell
                key={field}
                product={product}
                index={index}
                field={field}
                label={label}
                disabled={isDisabled(field, product)}
                autoFocus={preset === 'category' && field === 'categoryId' && index === 0}
              />
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function StockReason() {
  const { register, formState } = useFormContext<ProductBulkEditFormValues>();
  const error = formState.errors.stockReason;
  return (
    <div className="space-y-1">
      <label htmlFor="bulk-stock-reason" className="text-sm font-medium text-text">
        Reason for the stock change
      </label>
      <select
        id="bulk-stock-reason"
        className="block min-h-10 rounded-md border border-input-border bg-surface px-3 text-base text-text"
        aria-invalid={Boolean(error)}
        {...register('stockReason')}
      >
        <option value="">Choose a reason</option>
        {bulkEditStockReasons.map((reason) => (
          <option key={reason} value={reason}>
            {reason}
          </option>
        ))}
      </select>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
