import { useState, type ComponentProps } from 'react';
import type { UseFormRegisterReturn, FieldError } from 'react-hook-form';
import { Input } from '@dakly/ui/input';
import { Button } from '@dakly/ui/button';
type FormFieldProps = {
  label: string;
  field: UseFormRegisterReturn;
  error?: FieldError;
  hint?: string;
} & Omit<ComponentProps<'input'>, 'name'>;
export function FormField({ label, field, error, hint, type, ...props }: FormFieldProps) {
  const [shown, setShown] = useState(false);
  const id = field.name;
  const description = hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          {...props}
          {...field}
          id={id}
          type={type === 'password' && shown ? 'text' : type}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : description}
        />
        {type === 'password' ? (
          <Button
            variant="secondary"
            aria-label={`${shown ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
            onClick={() => setShown(!shown)}
          >
            {shown ? 'Hide' : 'Show'}
          </Button>
        ) : null}
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-danger">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
