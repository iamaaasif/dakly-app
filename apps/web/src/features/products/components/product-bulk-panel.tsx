'use client';
import { useState } from 'react';

import {
  BULK_EDIT_UNDO_HOURS,
  type BulkEditStockReason,
  type ProductBulkEditRow,
} from '@dakly/contracts/product-bulk-edits';
import type { ProductResponse } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';

import { useApplyProductBulkEdit } from '../api/product-bulk-edits';
import { countChangedValues, reviewLines } from '../product-bulk-edit';
import { ProductBulkGrid } from './product-bulk-grid';

type Review = { rows: ProductBulkEditRow[]; stockReason: BulkEditStockReason | '' };
type ProductBulkPanelProps = {
  products: ProductResponse[];
  preset: 'hide' | 'category' | undefined;
  onClose: () => void;
};

export function ProductBulkPanel({ products, preset, onClose }: ProductBulkPanelProps) {
  const [review, setReview] = useState<Review | null>(null);
  const apply = useApplyProductBulkEdit();
  const applyReview = (current: Review) =>
    apply.mutate(
      { rows: current.rows, stockReason: current.stockReason || undefined },
      { onSuccess: onClose },
    );
  return (
    <div className="space-y-4">
      <ProductBulkGrid
        // A new review always starts from the grid values, so a changed grid resets it.
        key={products.map((product) => product.id).join()}
        products={products}
        preset={preset}
        onReview={(rows, stockReason) => {
          apply.reset();
          setReview({ rows, stockReason });
        }}
        onCancel={onClose}
      />
      {review ? (
        <section
          aria-label="Review changes"
          className="space-y-3 rounded-lg border border-border bg-surface p-4 md:p-6"
        >
          <h2 className="text-lg font-semibold text-text">
            Review: {countChangedValues(review.rows)}{' '}
            {countChangedValues(review.rows) === 1 ? 'change' : 'changes'}
          </h2>
          <ul className="space-y-1 text-sm text-text-muted">
            {reviewLines(review.rows, products, review.stockReason).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {apply.error ? (
            <p role="alert" className="text-danger">
              {apply.error.message}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={apply.isPending} onClick={() => applyReview(review)}>
              Apply
            </Button>
            <p className="text-sm text-text-muted">
              Undo stays for {BULK_EDIT_UNDO_HOURS} hours. Stock is fixed with a new movement.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
