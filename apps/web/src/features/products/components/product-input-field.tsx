import { useFormContext, type FieldPath } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

type ProductInputFieldProps = {
  name: FieldPath<ProductFormValues>;
  label: string;
};
export function ProductInputField({ name, label }: ProductInputFieldProps) {
  const { register } = useFormContext<ProductFormValues>();
  return (
    <FormField name={name} label={label}>
      {(control) => (
        <Input
          {...control}
          inputMode={name.endsWith('Poisha') ? 'decimal' : undefined}
          {...register(name)}
        />
      )}
    </FormField>
  );
}
