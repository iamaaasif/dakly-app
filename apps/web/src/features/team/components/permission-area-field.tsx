import { useId } from 'react';
import { useFormContext } from 'react-hook-form';

import type { CreateRoleInput, PermissionArea } from '@dakly/contracts/team';
import { cn } from '@dakly/ui/cn';

import { permissionLabels } from '../permission-labels';

const buttonLabels: Record<string, string> = {
  none: 'No access',
  view: 'View',
  edit: 'Edit',
};

const descriptionLabels: Record<string, string> = {
  none: 'Hidden from them',
  view: 'Can view',
  edit: 'Can edit',
};

type Level = 'none' | 'view' | 'edit';

function AreaLevelButtons({
  area,
  currentLevel,
  levels,
  onChange,
}: {
  area: PermissionArea;
  currentLevel: string;
  levels: readonly Level[];
  onChange: (level: Level) => void;
}) {
  return (
    <div className="flex items-center gap-1 self-start rounded-md border border-input-border bg-surface-muted p-1 sm:self-auto">
      {levels.map((level) => (
        <button
          key={level}
          type="button"
          aria-pressed={currentLevel === level}
          aria-label={`${permissionLabels[area]}: ${buttonLabels[level]}`}
          onClick={() => onChange(level)}
          className={cn(
            'rounded min-h-8 px-2.5 py-1 text-xs font-medium transition-colors',
            currentLevel === level
              ? 'bg-surface font-semibold text-text'
              : 'text-text-muted hover:text-text',
          )}
        >
          {buttonLabels[level]}
        </button>
      ))}
    </div>
  );
}

export function PermissionAreaField({ area }: { area: PermissionArea }) {
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext<CreateRoleInput>();
  const id = useId();
  const error = errors.permissions?.areas?.[area];
  const currentLevel = watch(`permissions.areas.${area}`) ?? 'none';
  const levels =
    area === 'billing' ? (['none', 'view'] as const) : (['none', 'view', 'edit'] as const);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-text">
          {permissionLabels[area]}
        </label>
        <p className="text-xs text-text-muted">{descriptionLabels[currentLevel]}</p>
      </div>

      <AreaLevelButtons
        area={area}
        currentLevel={currentLevel}
        levels={levels}
        onChange={(level) =>
          setValue(`permissions.areas.${area}`, level, {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
      />

      <select
        id={id}
        tabIndex={-1}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="sr-only"
        {...register(`permissions.areas.${area}`)}
      >
        <option value="none">No access</option>
        <option value="view">View</option>
        {area !== 'billing' ? <option value="edit">Edit</option> : null}
      </select>

      {error ? (
        <p role="alert" id={`${id}-error`} className="text-xs text-danger">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
