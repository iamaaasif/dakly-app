import type { MemberResponse } from '@dakly/contracts/team';
import { Card } from '@dakly/ui/card';

import { roleLabels } from '../role-label';
import { MemberActions } from './member-actions';
import { formatDateTime } from '@/lib/format-date';
import { formatPhone } from '@/lib/format-phone';

export function MemberCard({ member, canEdit }: { member: MemberResponse; canEdit: boolean }) {
  const contact = member.phone ? formatPhone(member.phone) : member.email;
  const name = member.name ?? contact ?? 'Invited member';
  return (
    <Card className="min-w-0 space-y-3 break-words">
      <h3 className="font-semibold">{name}</h3>
      <dl className="space-y-2 text-sm">
        <div>
          <dt>Role</dt>
          <dd>{member.builtInRole ? roleLabels[member.builtInRole] : 'Custom role'}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{member.status}</dd>
        </div>
        <div>
          <dt>Contact</dt>
          <dd>{contact}</dd>
        </div>
        <div>
          <dt>Last active</dt>
          <dd>
            {member.lastActiveAt ? (
              <time dateTime={member.lastActiveAt}>{formatDateTime(member.lastActiveAt)}</time>
            ) : (
              'No activity recorded'
            )}
          </dd>
        </div>
        {member.inviteExpiresAt ? (
          <div>
            <dt>Invitation expires</dt>
            <dd>
              <time dateTime={member.inviteExpiresAt}>
                {formatDateTime(member.inviteExpiresAt)}
              </time>
            </dd>
          </div>
        ) : null}
      </dl>
      {canEdit && member.builtInRole !== 'owner' && member.status !== 'removed' ? (
        <MemberActions member={member} name={name} />
      ) : null}
    </Card>
  );
}
