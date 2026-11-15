import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { memberRoleSchema, type MemberResponse } from '@dakly/contracts/team';
import { Button } from '@dakly/ui/button';

import { useChangeMember } from '../api/change-member';
import { RolePicker } from './role-picker';
import { TeamError } from './team-error';
import { formError } from '@/lib/form-error';

export function MemberRoleForm({ member, onDone }: { member: MemberResponse; onDone: () => void }) {
  const form = useForm({
    resolver: zodResolver(memberRoleSchema),
    defaultValues: {
      builtInRole: member.builtInRole ?? undefined,
      roleId: member.roleId ?? undefined,
    },
  });
  const change = useChangeMember(member.id);
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (input) => {
        try {
          await change.mutateAsync(input);
          onDone();
        } catch (error) {
          formError(error, form.setError);
        }
      })}
    >
      <RolePicker
        value={form.watch()}
        error={form.formState.errors.builtInRole ?? form.formState.errors.roleId}
        onChange={(role) => {
          form.setValue('builtInRole', role.builtInRole);
          form.setValue('roleId', role.roleId);
        }}
      />
      <TeamError message={form.formState.errors.root?.message} />
      <Button type="submit" loading={change.isPending}>
        Save member role
      </Button>
    </form>
  );
}
