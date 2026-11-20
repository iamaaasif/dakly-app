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

function initialAreas(customAreas?: CreateRoleInput['permissions']['areas']) {
  const base: CreateRoleInput['permissions']['areas'] = {};
  for (const area of permissionAreas) {
    base[area] = customAreas?.[area] ?? 'none';
  }
  return base;
}

function initialRoleValues(role?: RoleResponse): CreateRoleInput {
  const perms = role?.permissions;
  return {
    name: role ? role.name : '',
    permissions: {
      areas: initialAreas(perms?.areas),
      seeFullPhone: Boolean(perms?.seeFullPhone),
      exportLists: Boolean(perms?.exportLists),
      refund: Boolean(perms?.refund),
    },
  };
}

export function RoleForm({ role, onDone }: { role?: RoleResponse; onDone: () => void }) {
  const form = useForm<CreateRoleInput>({
    resolver: zodResolver(createRoleSchema),
    defaultValues: initialRoleValues(role),
  });
  const create = useCreateRole();
  const change = useChangeRole(role?.id ?? '');

  const onSubmit = async (input: CreateRoleInput) => {
    try {
      if (role) await change.mutateAsync(input);
      else await create.mutateAsync(input);
      onDone();
    } catch (error) {
      formError(error, form.setError);
    }
  };

  return (
    <FormProvider {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <TeamField
          label="Role name"
          field={form.register('name')}
          error={form.formState.errors.name}
        />
        <PermissionFields />
        <TeamError message={form.formState.errors.root?.message} />
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
