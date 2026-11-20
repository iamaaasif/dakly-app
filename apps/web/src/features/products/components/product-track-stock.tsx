'use client';
import { useId } from 'react';
import { useController } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Label } from '@dakly/ui/label';
import { Switch } from '@dakly/ui/switch';

export function ProductTrackStock() {
  const { field } = useController<ProductFormValues, 'isStockTracked'>({ name: 'isStockTracked' });
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
      <Switch
        id={id}
        checked={checked}
        aria-label="Track stock"
        onCheckedChange={(next) => field.onChange(next)}
      />
    </div>
  );
}
