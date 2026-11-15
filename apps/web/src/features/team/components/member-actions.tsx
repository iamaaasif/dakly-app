import { useState } from 'react';
import type { MemberResponse } from '@dakly/contracts/team';
import { Button } from '@dakly/ui/button';
import { SessionDialog as Dialog } from '@/components/session-dialog';
import { useRemoveMember } from '../api/remove-member';
import { useResendInvite } from '../api/resend-invite';
import { MemberRoleForm } from './member-role-form';
import { TeamError } from './team-error';
export function MemberActions({ member, name }: { member: MemberResponse; name: string }) {
  const [action, setAction] = useState<'role' | 'remove' | null>(null);
  const remove = useRemoveMember(member.id);
  const resend = useResendInvite(member.id);
  const removal = member.status === 'invited' ? 'Cancel invitation' : 'Remove member';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setAction('role')}>
          Change role
        </Button>
        {member.status === 'invited' ? (
          <Button variant="secondary" loading={resend.isPending} onClick={() => resend.mutate()}>
            Resend invitation
          </Button>
        ) : null}
        <Button variant="danger" onClick={() => setAction('remove')}>
          {removal}
        </Button>
      </div>
      <TeamError message={resend.error?.message} />
      {action === 'role' ? (
        <Dialog open title={`Change role for ${name}`} onClose={() => setAction(null)}>
          <MemberRoleForm member={member} onDone={() => setAction(null)} />
        </Dialog>
      ) : null}
      {action === 'remove' ? (
        <Dialog open title={`${removal} for ${name}?`} onClose={() => setAction(null)}>
          <p className="mb-4">
            This removes this membership’s access to the shop. Other shops are unaffected.
          </p>
          <TeamError message={remove.error?.message} />
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => remove.mutate(undefined, { onSuccess: () => setAction(null) })}
          >
            {removal}
          </Button>
        </Dialog>
      ) : null}
    </div>
  );
}
