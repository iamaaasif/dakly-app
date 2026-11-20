import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { inviteMemberSchema } from '@dakly/contracts/team';
import { Button } from '@dakly/ui/button';

import { useInviteMember } from '../api/invite-member';
import { InviteRecipient } from './invite-recipient';
import { RolePicker } from './role-picker';
import { TeamError } from './team-error';
import { formError } from '@/lib/form-error';

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
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={invite.isPending}>
          Send invitation
        </Button>
      </div>
    </form>
  );
}
