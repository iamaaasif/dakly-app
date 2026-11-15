import { useId } from 'react';
import { useFormContext } from 'react-hook-form';

import type { CreateRoleInput, PermissionArea } from '@dakly/contracts/team';

import { permissionLabels } from '../permission-labels';

export function PermissionAreaField({ area }: { area: PermissionArea }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<CreateRoleInput>();
  const id = useId();
  const error = errors.permissions?.areas?.[area];
  return (
    <div>
      <label htmlFor={id} className="block">
        {permissionLabels[area]}
      </label>
      <select
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="mt-2 min-h-10 w-full rounded-md border border-input-border bg-surface px-3"
        {...register(`permissions.areas.${area}`)}
      >
        <option value="none">No access</option>
        <option value="view">View</option>
        {area !== 'billing' ? <option value="edit">Edit</option> : null}
      </select>
      {error ? (
        <p role="alert" id={`${id}-error`} className="text-danger">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
