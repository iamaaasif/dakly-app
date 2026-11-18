'use client';
import { useId, type ReactNode } from 'react';
import { get, useFormState, type FieldError } from 'react-hook-form';

import { Label } from './label';

type FieldControlProps = {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
};

export type FormFieldProps = {
  name: string;
  label: string;
  hint?: string;
  children: (control: FieldControlProps) => ReactNode;
};

export function FormField({ name, label, hint, children }: FormFieldProps) {
  const { errors } = useFormState({ name });
  // get() reads nested names such as "address.district".
  const field = get(errors, name);
  const error: FieldError | undefined = Array.isArray(field)
    ? (get(field, 'root') ?? field.find((item) => item?.message))
    : field;
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ');
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy || undefined,
      })}
      {hint && (
        <p id={hintId} className="text-sm text-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      )}
    </div>
  );
}
