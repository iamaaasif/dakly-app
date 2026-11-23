import { Eye, EyeOff } from 'lucide-react';
import { useState, type ComponentProps, type ReactNode } from 'react';
import type { UseFormRegisterReturn, FieldError } from 'react-hook-form';

import { cn } from '@dakly/ui/cn';
import { Input } from '@dakly/ui/input';

type FormFieldProps = {
  label: string;
  field: UseFormRegisterReturn;
  error?: FieldError;
  hint?: string;
  // Fixed text before the value, such as the +880 country code.
  prefix?: string;
  // Sits on the label row, such as a "Forgot password?" link.
  labelAside?: ReactNode;
} & Omit<ComponentProps<'input'>, 'name' | 'prefix'>;
export function FormField({
  label,
  field,
  error,
  hint,
  prefix,
  labelAside,
  type,
  className,
  ...props
}: FormFieldProps) {
  const [shown, setShown] = useState(false);
  const id = field.name;
  const description = hint ? `${id}-hint` : undefined;
  const input = (
    <Input
      {...props}
      {...field}
      id={id}
      type={type === 'password' && shown ? 'text' : type}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${id}-error` : description}
      className={cn(inputClass(prefix, type), className)}
    />
  );
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="block font-semibold">
          {label}
        </label>
        {labelAside}
      </div>
      <FieldControl
        prefix={prefix}
        isPassword={type === 'password'}
        label={label}
        shown={shown}
        onToggle={() => setShown(!shown)}
      >
        {input}
      </FieldControl>
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

function FieldControl({
  prefix,
  isPassword,
  label,
  shown,
  onToggle,
  children,
}: {
  prefix?: string;
  isPassword: boolean;
  label: string;
  shown: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  if (prefix)
    return (
      <div className="flex">
        <span className="flex items-center rounded-l-md border border-r-0 border-input-border bg-surface-muted px-3 text-text-muted">
          {prefix}
        </span>
        {children}
      </div>
    );
  if (!isPassword) return children;
  return (
    <div className="relative">
      {children}
      <button
        type="button"
        aria-label={`${shown ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
        onClick={onToggle}
        className="absolute inset-y-0 right-0 flex items-center gap-1.5 rounded-md px-3 text-sm font-semibold hover:text-action focus-visible:outline-2 focus-visible:outline-focus"
      >
        {shown ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}
        {shown ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

function inputClass(prefix: string | undefined, type: string | undefined) {
  if (prefix) return 'rounded-l-none';
  return type === 'password' ? 'pr-16' : undefined;
}
