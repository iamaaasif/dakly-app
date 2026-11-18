import { useFormContext, type FieldPath } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

type ProductMoneyFieldProps = { name: FieldPath<ProductFormValues>; label: string };
export function ProductMoneyField({ name, label }: ProductMoneyFieldProps) {
  const { register } = useFormContext<ProductFormValues>();
  return (
    <FormField name={name} label={label}>
      {(control) => <Input {...control} inputMode="decimal" {...register(name)} />}
    </FormField>
  );
}
