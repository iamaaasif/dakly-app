import { useId } from 'react';
import { useFormContext } from 'react-hook-form';

import type { AccessLevel, CreateRoleInput, PermissionArea } from '@dakly/contracts/team';

import { accessLabels, permissionLabels } from '../permission-labels';

function AreaRadios({
  area,
  id,
  levels,
  hasError,
}: {
  area: PermissionArea;
  id: string;
  levels: readonly AccessLevel[];
  hasError: boolean;
}) {
  const { register } = useFormContext<CreateRoleInput>();
  return (
    <div className="flex items-center gap-1 self-start rounded-md border border-input-border bg-surface-muted p-1 sm:self-auto">
      {levels.map((level) => {
        const radioId = `${id}-${level}`;
        return (
          <div key={level} className="relative">
            <input
              type="radio"
              id={radioId}
              value={level}
              aria-invalid={hasError}
              aria-describedby={hasError ? `${id}-error` : undefined}
              className="peer sr-only"
              {...register(`permissions.areas.${area}`)}
            />
            <label
              htmlFor={radioId}
              className="rounded flex min-h-8 cursor-pointer items-center px-2.5 py-1 text-xs font-medium text-text-muted transition-colors peer-checked:bg-surface peer-checked:font-semibold peer-checked:text-text peer-focus-visible:ring-2 peer-focus-visible:ring-primary hover:text-text"
            >
              {accessLabels[level]}
            </label>
          </div>
        );
      })}
    </div>
  );
}

export function PermissionAreaField({ area }: { area: PermissionArea }) {
  const {
    formState: { errors },
  } = useFormContext<CreateRoleInput>();
  const id = useId();
  const error = errors.permissions?.areas?.[area];
  const levels: readonly AccessLevel[] =
    area === 'billing' ? ['none', 'view'] : ['none', 'view', 'edit'];

  return (
    <fieldset
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${id}-error` : undefined}
      className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <legend className="text-sm font-medium text-text">{permissionLabels[area]}</legend>

      <AreaRadios area={area} id={id} levels={levels} hasError={Boolean(error)} />

      {error ? (
        <p role="alert" id={`${id}-error`} className="text-xs text-danger">
          {error.message}
        </p>
      ) : null}
    </fieldset>
  );
}
