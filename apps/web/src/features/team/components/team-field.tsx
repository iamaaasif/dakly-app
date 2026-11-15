import { useId, type ComponentProps } from 'react';
import type { UseFormRegisterReturn, FieldError } from 'react-hook-form';

import { Input } from '@dakly/ui/input';

type TeamFieldProps = {
  label: string;
  field: UseFormRegisterReturn;
  error?: FieldError;
} & ComponentProps<'input'>;
export function TeamField({ label, field, error, ...props }: TeamFieldProps) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      <Input
        {...props}
        {...field}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p role="alert" id={`${id}-error`} className="text-danger">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
