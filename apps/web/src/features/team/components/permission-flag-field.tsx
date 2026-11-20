import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';

import type { CreateRoleInput } from '@dakly/contracts/team';
import { Switch } from '@dakly/ui/switch';

import { flagDescriptions, flagLabels, type PermissionFlag } from '../permission-labels';

export function PermissionFlagField({ flag }: { flag: PermissionFlag }) {
  const {
    control,
    formState: { errors },
  } = useFormContext<CreateRoleInput>();
  const id = useId();
  const error = errors.permissions?.[flag];

  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-3">
      <div className="min-w-0 space-y-0.5 pr-4">
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-text">
          {flagLabels[flag]}
        </label>
        <p className="text-xs text-text-muted">{flagDescriptions[flag]}</p>
      </div>

      <div className="flex shrink-0 items-center">
        <Controller
          control={control}
          name={`permissions.${flag}`}
          render={({ field }) => (
            <Switch
              id={id}
              checked={field.value}
              onCheckedChange={field.onChange}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : undefined}
            />
          )}
        />
      </div>

      {error ? (
        <p role="alert" id={`${id}-error`} className="text-xs text-danger">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
