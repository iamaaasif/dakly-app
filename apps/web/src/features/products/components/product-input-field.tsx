'use client';
import { useId } from 'react';
import {
  get,
  useFormContext,
  useFormState,
  type FieldError,
  type FieldPath,
} from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Input } from '@dakly/ui/input';
import { Label } from '@dakly/ui/label';

type ProductInputFieldProps = {
  name: FieldPath<ProductFormValues>;
  label: string;
  placeholder?: string;
  optional?: boolean;
};

export function ProductInputField({ name, label, placeholder, optional }: ProductInputFieldProps) {
  const { register } = useFormContext<ProductFormValues>();
  const { errors } = useFormState<ProductFormValues>({ name });
  const field = get(errors, name);
  const error: FieldError | undefined = Array.isArray(field)
    ? (get(field, 'root') ?? field.find((item) => item?.message))
    : field;
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        {optional ? <span className="text-xs text-text-muted">· optional</span> : null}
      </div>
      <Input
        id={id}
        placeholder={placeholder}
        inputMode={name.endsWith('Poisha') ? 'decimal' : undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...register(name)}
      />
      {error?.message ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
