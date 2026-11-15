import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createRoleSchema, type RoleResponse } from '@dakly/contracts/team';
import { Button } from '@dakly/ui/button';
import { formError } from '@/lib/form-error';
import { useCreateRole } from '../api/create-role';
import { useChangeRole } from '../api/change-role';
import { TeamField } from './team-field';
import { TeamError } from './team-error';
import { PermissionFields } from './permission-fields';
export function RoleForm({ role, onDone }: { role?: RoleResponse; onDone: () => void }) {
  const form = useForm({
    resolver: zodResolver(createRoleSchema),
    defaultValues: {
      name: role?.name ?? '',
      permissions: role?.permissions ?? {
        areas: {},
        seeFullPhone: false,
        exportLists: false,
        refund: false,
      },
    },
  });
  const create = useCreateRole();
  const change = useChangeRole(role?.id ?? '');
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
        <TeamError message={form.formState.errors.root?.message} />
        <Button type="submit" loading={create.isPending || change.isPending}>
          Save role
        </Button>
      </form>
    </FormProvider>
  );
}
