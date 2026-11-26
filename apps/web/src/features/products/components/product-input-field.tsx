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
  deps?: FieldPath<ProductFormValues>;
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
  deps,
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
          {...register(name, { deps })}
        />
      )}
    </FormField>
  );
}
