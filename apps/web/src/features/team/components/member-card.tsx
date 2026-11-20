import { Lock } from 'lucide-react';

import type { MemberResponse } from '@dakly/contracts/team';
import { Badge } from '@dakly/ui/badge';

import { roleLabels } from '../role-label';
import { MemberActions } from './member-actions';
import { formatDateTime } from '@/lib/format-date';
import { formatPhone } from '@/lib/format-phone';
import { initialsOf } from '@/lib/initials';
import { useSessionContext } from '@/lib/session-context';

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

function MemberStatusBadge({ status }: { status: MemberResponse['status'] }) {
  const variant = status === 'active' ? 'success' : 'warning';
  return <Badge variant={variant}>{statusLabels[status]}</Badge>;
}

function MemberIdentity({
  name,
  contact,
  isCurrentUser,
}: {
  name: string;
  contact: string | null;
  isCurrentUser: boolean;
}) {
  return (
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
  );
}

function getMemberContact(member: MemberResponse): string | null {
  if (member.phone) return formatPhone(member.phone);
  return member.email;
}

function getMemberName(member: MemberResponse, contact: string | null): string {
  if (member.name) return member.name;
  if (contact) return contact;
  return 'Invited member';
}

function canShowActions(member: MemberResponse, canEdit: boolean): boolean {
  return canEdit && member.builtInRole !== 'owner' && member.status !== 'removed';
}

export function MemberCard({ member, canEdit }: { member: MemberResponse; canEdit: boolean }) {
  const { data: context } = useSessionContext();
  const contact = getMemberContact(member);
  const name = getMemberName(member, contact);
  const isCurrentUser = Boolean(context?.user?.id && member.userId === context.user.id);

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <MemberIdentity name={name} contact={contact} isCurrentUser={isCurrentUser} />

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

        {canShowActions(member, canEdit) ? <MemberActions member={member} name={name} /> : null}
      </div>
    </div>
  );
}

const statusLabels: Record<MemberResponse['status'], string> = {
  invited: 'Invited',
  active: 'Active',
  removed: 'Removed',
};
