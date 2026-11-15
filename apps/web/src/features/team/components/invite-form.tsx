import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { inviteMemberSchema } from '@dakly/contracts/team';
import { Button } from '@dakly/ui/button';
import { formError } from '@/lib/form-error';
import { useInviteMember } from '../api/invite-member';
import { RolePicker } from './role-picker';
import { InviteRecipient } from './invite-recipient';
import { TeamError } from './team-error';
export function InviteForm({ onDone }: { onDone: () => void }) {
  const [channel, setChannel] = useState<'phone' | 'email'>('phone');
  const form = useForm({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: {
      builtInRole: 'support_agent' as const,
      phone: '',
      email: undefined as string | undefined,
      roleId: undefined as string | undefined,
    },
  });
  const invite = useInviteMember();
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (input) => {
        try {
          await invite.mutateAsync(input);
          onDone();
        } catch (error) {
          formError(error, form.setError);
        }
      })}
    >
      <InviteRecipient
        channel={channel}
        onChange={(next) => {
          setChannel(next);
          form.setValue('phone', next === 'phone' ? '' : undefined);
          form.setValue('email', next === 'email' ? '' : undefined);
        }}
        form={form}
      />
      <RolePicker
        value={form.watch()}
        error={form.formState.errors.builtInRole ?? form.formState.errors.roleId}
        onChange={(role) => {
          form.setValue('builtInRole', role.builtInRole);
          form.setValue('roleId', role.roleId);
        }}
      />
      <p className="text-sm text-text-muted">
        The recipient must verify this contact. Invitations expire in seven days and reserve a seat
        until they expire or are cancelled.
      </p>
      <TeamError message={form.formState.errors.root?.message} />
      <Button type="submit" loading={invite.isPending}>
        Send invitation
      </Button>
    </form>
  );
}
