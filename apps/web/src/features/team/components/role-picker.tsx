import type { FieldError } from 'react-hook-form';
import type { MemberRoleInput } from '@dakly/contracts/team';
import { Button } from '@dakly/ui/button';
import { useRoleOptions } from '../api/roles';
import { RoleOptions } from './role-options';
type RolePickerProps = {
  value: MemberRoleInput;
  onChange: (value: MemberRoleInput) => void;
  error?: FieldError;
};
export function RolePicker({ value, onChange, error }: RolePickerProps) {
  const roles = useRoleOptions();
  if (roles.isPending) return <p role="status">Loading roles…</p>;
  if (roles.error)
    return (
      <div role="alert">
        <p>{roles.error.message}</p>
        <Button onClick={() => void roles.refetch()}>Retry roles</Button>
      </div>
    );
  const builtInRoles = roles.data.pages[0]?.builtInRoles ?? [];
  const customRoles = roles.data.pages.flatMap((page) => page.items);
  return (
    <div className="space-y-2">
      <label htmlFor="member-role" className="block font-medium">
        Role
      </label>
      <select
        id="member-role"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'member-role-error' : undefined}
        className="min-h-10 w-full rounded-md border border-input-border bg-surface px-3"
        value={value.builtInRole ?? value.roleId ?? ''}
        onChange={(event) => {
          const builtIn = builtInRoles.find((role) => role.builtInRole === event.target.value);
          onChange(builtIn ? { builtInRole: builtIn.builtInRole } : { roleId: event.target.value });
        }}
      >
        <RoleOptions
          builtInRoles={builtInRoles}
          customRoles={customRoles}
          currentRoleId={value.roleId}
        />
      </select>
      {error ? (
        <p id="member-role-error" role="alert" className="text-danger">
          {error.message}
        </p>
      ) : null}
      {roles.hasNextPage ? (
        <Button
          variant="secondary"
          loading={roles.isFetchingNextPage}
          onClick={() => void roles.fetchNextPage()}
        >
          Load more roles
        </Button>
      ) : null}
      <p className="text-sm text-text-muted">
        You can grant only permissions you currently have. Ownership changes through a transfer.
      </p>
    </div>
  );
}
