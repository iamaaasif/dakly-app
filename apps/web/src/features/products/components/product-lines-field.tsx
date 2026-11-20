'use client';
import { useController } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { FormField } from '@dakly/ui/form-field';
import { Textarea } from '@dakly/ui/textarea';

type ProductLinesFieldProps = {
  name: 'description' | 'aliases' | `options.${number}.values`;
  label: string;
  hint?: string;
  placeholder?: string;
  rows?: number;
};

export function ProductLinesField({
  name,
  label,
  hint,
  placeholder,
  rows = 3,
}: ProductLinesFieldProps) {
  const { field } = useController<ProductFormValues, ProductLinesFieldProps['name']>({ name });
  return (
    <FormField name={name} label={label} hint={hint}>
      {(control) => (
        <Textarea
          {...control}
          ref={field.ref}
          onBlur={field.onBlur}
          rows={rows}
          placeholder={placeholder}
          className="min-h-18"
          value={Array.isArray(field.value) ? field.value.join('\n') : (field.value ?? '')}
          onChange={(event) =>
            field.onChange(
              name === 'description' ? event.target.value : event.target.value.split('\n'),
            )
          }
        />
      )}
    </FormField>
  );
}
