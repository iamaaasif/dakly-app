import { useId } from 'react';
import { useFormContext } from 'react-hook-form';

import type { CreateRoleInput } from '@dakly/contracts/team';
import { Switch } from '@dakly/ui/switch';

import { flagLabels } from '../permission-labels';

const flagDescriptions: Record<string, string> = {
  seeFullPhone: 'Otherwise numbers show as 01712-•••903.',
  exportLists: 'Lets them take your customer data out of Dakly.',
  refund: 'Allow issuing refunds for cancelled or returned orders.',
};

export function PermissionFlagField({ flag }: { flag: keyof typeof flagLabels }) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<CreateRoleInput>();
  const id = useId();
  const error = errors.permissions?.[flag];
  const checked = Boolean(watch(`permissions.${flag}`));

  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-3">
      <div className="min-w-0 space-y-0.5 pr-4">
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-text">
          {flagLabels[flag]}
        </label>
        <p className="text-xs text-text-muted">{flagDescriptions[flag]}</p>
      </div>

      <div className="flex shrink-0 items-center">
        <input type="hidden" {...register(`permissions.${flag}`)} />
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={(val) =>
            setValue(`permissions.${flag}`, val, { shouldDirty: true, shouldValidate: true })
          }
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
