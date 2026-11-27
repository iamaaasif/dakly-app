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

export function InviteForm({
  defaultChannel,
  onDone,
}: {
  defaultChannel: 'phone' | 'email';
  onDone: () => void;
}) {
  const [channel, setChannel] = useState(defaultChannel);
  const form = useForm({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: {
      builtInRole: 'support_agent' as const,
      phone: channel === 'phone' ? '' : undefined,
      email: channel === 'email' ? '' : undefined,
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
      <InviteInstructions recommendEmail={defaultChannel === 'email' && channel === 'phone'} />
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

function InviteInstructions({ recommendEmail }: { recommendEmail: boolean }) {
  return (
    <p className="text-sm text-text-muted">
      The recipient must verify this contact. Invitations expire in seven days and reserve a seat
      until they expire or are cancelled.
      {recommendEmail ? ' Invite by email if the recipient needs to create an account.' : null}
    </p>
  );
}
