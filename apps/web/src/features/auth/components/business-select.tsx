import type { FieldError, UseFormRegisterReturn } from 'react-hook-form';

export function BusinessSelect({
  label,
  field,
  error,
  options,
}: {
  label: string;
  field: UseFormRegisterReturn;
  error?: FieldError;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={field.name} className="block font-medium">
        {label}
      </label>
      <select
        {...field}
        id={field.name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${field.name}-error` : undefined}
        className="min-h-10 w-full rounded-md border border-input-border bg-surface p-2 focus-visible:outline-2 focus-visible:outline-focus"
      >
        <option value="">Choose one</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p role="alert" id={`${field.name}-error`} className="text-danger">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
