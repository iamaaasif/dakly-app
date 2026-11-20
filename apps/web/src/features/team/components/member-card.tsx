import { Lock } from 'lucide-react';

import type { MemberResponse } from '@dakly/contracts/team';
import { Badge } from '@dakly/ui/badge';

import { roleLabels } from '../role-label';
import { MemberActions } from './member-actions';
import { formatDateTime } from '@/lib/format-date';
import { formatPhone } from '@/lib/format-phone';
import { initialsOf } from '@/lib/initials';

function MemberRoleDisplay({ member }: { member: MemberResponse }) {
  if (member.builtInRole === 'owner') {
    return (
      <span className="inline-flex items-center gap-1.5 text-text">
        <Lock className="size-4 text-text-muted" aria-hidden="true" />
        Owner
      </span>
    );
  }
  return (
    <span className="text-text">
      {member.builtInRole ? roleLabels[member.builtInRole] : 'Custom role'}
    </span>
  );
}

function MemberActivity({ member }: { member: MemberResponse }) {
  if (member.lastActiveAt) {
    return <time dateTime={member.lastActiveAt}>{formatDateTime(member.lastActiveAt)}</time>;
  }
  if (member.inviteExpiresAt) {
    return (
      <time dateTime={member.inviteExpiresAt}>
        Expires {formatDateTime(member.inviteExpiresAt)}
      </time>
    );
  }
  return <span>No activity recorded</span>;
}

const statusLabels: Record<MemberResponse['status'], string> = {
  invited: 'Invited',
  active: 'Active',
  removed: 'Removed',
};

function MemberStatusBadge({ status }: { status: MemberResponse['status'] }) {
  const variant = status === 'active' ? 'success' : 'warning';
  return <Badge variant={variant}>{statusLabels[status]}</Badge>;
}

export function MemberCard({
  member,
  canEdit,
  currentUserId,
}: {
  member: MemberResponse;
  canEdit: boolean;
  currentUserId?: string;
}) {
  const contact = member.phone ? formatPhone(member.phone) : member.email;
  const name = member.name || contact || 'Invited member';
  const isCurrentUser = Boolean(currentUserId && member.userId === currentUserId);
  const showActions = canEdit && member.builtInRole !== 'owner' && member.status !== 'removed';

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold text-text">
          {initialsOf(name)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-text">{name}</h3>
            {isCurrentUser ? <Badge variant="neutral">You</Badge> : null}
          </div>
          <p className="truncate text-sm text-text-muted">{contact}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end sm:gap-6">
        <div className="text-sm font-medium">
          <MemberRoleDisplay member={member} />
        </div>

        <div className="text-left sm:text-right">
          <MemberStatusBadge status={member.status} />
          <div className="mt-0.5 text-xs text-text-muted">
            <MemberActivity member={member} />
          </div>
        </div>

        {showActions ? <MemberActions member={member} name={name} /> : null}
      </div>
    </div>
  );
}
