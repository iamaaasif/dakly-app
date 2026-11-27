'use client';
import { useId } from 'react';
import { useController } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Checkbox } from '@dakly/ui/checkbox';
import { Label } from '@dakly/ui/label';

// Switching this off keeps the stock number typed so far; it comes back when switched on again.
export function ProductTrackStock() {
  const { field } = useController<ProductFormValues, 'isStockTracked'>({ name: 'isStockTracked' });
  const id = useId();

  return (
    <div className="flex items-start gap-3 py-1">
      <Checkbox
        id={id}
        checked={field.value}
        onCheckedChange={(checked) => field.onChange(checked === true)}
        className="mt-0.5"
      />
      <div className="space-y-0.5">
        <Label htmlFor={id} className="cursor-pointer text-sm font-medium text-text">
          Track stock availability
        </Label>
        <p className="text-xs text-text-muted">
          Dakly warns you before you sell what you don't have.
        </p>
      </div>
    </div>
  );
}
