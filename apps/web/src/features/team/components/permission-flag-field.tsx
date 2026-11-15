import { useId } from 'react';
import { useFormContext } from 'react-hook-form';
import type { CreateRoleInput } from '@dakly/contracts/team';
import { flagLabels } from '../permission-labels';
export function PermissionFlagField({ flag }: { flag: keyof typeof flagLabels }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<CreateRoleInput>();
  const id = useId();
  const error = errors.permissions?.[flag];
  return (
    <div>
      <label htmlFor={id} className="flex min-h-10 items-center gap-3">
        <input
          id={id}
          type="checkbox"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          {...register(`permissions.${flag}`)}
        />
        {flagLabels[flag]}
      </label>
      {error ? (
        <p role="alert" id={`${id}-error`} className="text-danger">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
