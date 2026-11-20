import { useFormContext, type FieldPath } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

type ProductInputFieldProps = {
  name: FieldPath<ProductFormValues>;
  label: string;
  placeholder?: string;
  optional?: boolean;
  autoFocus?: boolean;
};

export function ProductInputField({
  name,
  label,
  placeholder,
  optional,
  autoFocus,
}: ProductInputFieldProps) {
  const { register } = useFormContext<ProductFormValues>();
  return (
    <FormField name={name} label={label} optional={optional}>
      {(control) => (
        <Input
          {...control}
          autoFocus={autoFocus}
          placeholder={placeholder}
          inputMode={name.endsWith('Poisha') ? 'decimal' : undefined}
          {...register(name)}
        />
      )}
    </FormField>
  );
}
