import { useFormContext } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

// A new product with no sizes has one row, so its starting stock is a single number.
export function ProductPlainStock() {
  const { register, watch } = useFormContext<ProductFormValues>();
  if (watch('options')?.length || !watch('isStockTracked')) return null;
  return (
    <FormField name="variants.0.initialStock" label="Stock">
      {(control) => (
        <Input
          {...control}
          type="number"
          min="0"
          inputMode="numeric"
          placeholder="0"
          {...register('variants.0.initialStock', {
            setValueAs: (value: string) => (value === '' ? 0 : Number(value)),
          })}
        />
      )}
    </FormField>
  );
}
