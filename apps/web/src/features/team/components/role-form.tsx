import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';

import {
  createRoleSchema,
  permissionAreas,
  type CreateRoleInput,
  type RoleResponse,
} from '@dakly/contracts/team';
import { Button } from '@dakly/ui/button';

import { useChangeRole } from '../api/change-role';
import { useCreateRole } from '../api/create-role';
import { PermissionFields } from './permission-fields';
import { TeamError } from './team-error';
import { TeamField } from './team-field';
import { formError } from '@/lib/form-error';

export function RoleForm({ role, onDone }: { role?: RoleResponse; onDone: () => void }) {
  const perms = role ? role.permissions : undefined;
  const form = useForm<CreateRoleInput>({
    resolver: zodResolver(createRoleSchema),
    defaultValues: {
      name: role ? role.name : '',
      permissions: {
        areas: Object.fromEntries(
          permissionAreas.map((area) => [area, perms ? perms.areas[area] : 'none']),
        ),
        seeFullPhone: perms ? perms.seeFullPhone : false,
        exportLists: perms ? perms.exportLists : false,
        refund: perms ? perms.refund : false,
      },
    },
  });
  const create = useCreateRole();
  const change = useChangeRole(role ? role.id : '');
  const rootError = form.formState.errors.root;

  return (
    <FormProvider {...form}>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (input) => {
          try {
            if (role) await change.mutateAsync(input);
            else await create.mutateAsync(input);
            onDone();
          } catch (error) {
            formError(error, form.setError);
          }
        })}
      >
        <TeamField
          label="Role name"
          field={form.register('name')}
          error={form.formState.errors.name}
        />
        <PermissionFields />
        <TeamError message={rootError ? rootError.message : undefined} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending || change.isPending}>
            Save role
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
