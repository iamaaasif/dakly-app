'use client';
import { useId } from 'react';
import { useController } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { cn } from '@dakly/ui/cn';
import { Label } from '@dakly/ui/label';

type ProductTrackStockProps = {
  name?: 'isStockTracked';
};

export function ProductTrackStock({ name = 'isStockTracked' }: ProductTrackStockProps) {
  const { field } = useController<ProductFormValues, 'isStockTracked'>({ name });
  const id = useId();
  const checked = Boolean(field.value);

  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="cursor-pointer text-sm font-medium text-text">
          Track stock
        </Label>
        <p className="text-xs text-text-muted">
          Dakly warns you before you sell what you don't have.
        </p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Track stock"
        onClick={() => field.onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-focus',
          checked ? 'bg-primary' : 'border-border bg-surface-muted',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'shadow pointer-events-none inline-block size-5 transform rounded-full bg-surface ring-0 transition duration-200 ease-in-out',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  );
}
