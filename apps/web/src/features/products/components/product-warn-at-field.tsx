'use client';
import { useFormContext } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

// The warning level is set once for the product and copied to every variant.
export function ProductWarnAtField() {
  const form = useFormContext<ProductFormValues>();
  const value = form.watch('variants.0.lowStockThreshold');
  return (
    <FormField
      name="variants.0.lowStockThreshold"
      label="Low stock threshold"
      hint="Warn me when stock falls below this amount."
    >
      {(control) => (
        <Input
          {...control}
          inputMode="numeric"
          placeholder="Shop setting"
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(event) => {
            const typed = event.target.value.replace(/\D/g, '');
            (form.getValues('variants') ?? []).forEach((_, index) =>
              form.setValue(`variants.${index}.lowStockThreshold`, typed, { shouldDirty: true }),
            );
          }}
        />
      )}
    </FormField>
  );
}
