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

function inputModeFor(name: string) {
  if (name.endsWith('Poisha')) return 'decimal';
  return name === 'weightGrams' ? 'numeric' : undefined;
}

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
          inputMode={inputModeFor(name)}
          {...register(name)}
        />
      )}
    </FormField>
  );
}
