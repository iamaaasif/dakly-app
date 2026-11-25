'use client';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';

import type { MemberResponse } from '@dakly/contracts/team';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { QueryError } from '@dakly/ui/query-error';

import { useMembers } from '../api/members';
import { InviteForm } from './invite-form';
import { MemberCard } from './member-card';
import { TeamLoading } from './team-loading';
import { TeamPagination } from './team-pagination';
import { SessionDialog as Dialog } from '@/components/session-dialog';
import { useSessionContext } from '@/lib/session-context';

function MemberSeatsCard({ seats }: { seats: { used: number; limit: number } }) {
  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-text">
          {seats.used} of {seats.limit} seats used
        </span>
      </div>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={seats.limit}
        aria-valuenow={seats.used}
        aria-label="Team seats"
        className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className="h-full rounded-full bg-action"
          style={{ width: `${Math.min(100, Math.max(0, (seats.used / seats.limit) * 100))}%` }}
        />
      </div>
      {seats.used >= seats.limit ? (
        <p role="status" className="text-xs text-warning">
          Your plan’s {seats.limit} team seats are in use. Remove a member or cancel an invitation
          to free a seat.
        </p>
      ) : null}
    </Card>
  );
}

function MemberList({
  items,
  canEdit,
  currentUserId,
}: {
  items: MemberResponse[];
  canEdit: boolean;
  currentUserId?: string;
}) {
  if (!items.length) {
    return (
      <p className="text-text-muted">
        No members on this page. Return to the first page or invite a member.
      </p>
    );
  }
  return (
    <Card className="divide-y divide-border overflow-hidden p-0">
      {items.map((member) => (
        <MemberCard
          key={member.id}
          member={member}
          canEdit={canEdit}
          currentUserId={currentUserId}
        />
      ))}
    </Card>
  );
}

export function MembersScreen({
  cursor,
  inviteChannel = 'email',
}: {
  cursor?: string;
  inviteChannel?: 'phone' | 'email';
}) {
  const members = useMembers(cursor);
  const { data: context } = useSessionContext();
  const [inviting, setInviting] = useState(false);

  if (members.isPending) return <TeamLoading />;
  if (members.error)
    return (
      <QueryError
        message={members.error.message}
        onRetry={() => void members.refetch()}
        retryLabel="Retry members"
      />
    );
  const { seats, items, nextCursor } = members.data;
  const canEdit = Boolean(context?.currentStore?.canEditTeam);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Members ({seats.used})</h2>
        {canEdit ? (
          <Button
            disabled={seats.used >= seats.limit}
            onClick={() => setInviting(true)}
            className="self-start sm:self-auto"
          >
            <UserPlus className="size-4" aria-hidden="true" />
            Invite member
          </Button>
        ) : (
          <p className="text-sm text-text-muted">
            You can view the team. Team editing is not available with your current access.
          </p>
        )}
      </div>

      <MemberSeatsCard seats={seats} />

      {inviting ? (
        <Dialog open title="Invite a team member" onClose={() => setInviting(false)}>
          <InviteForm defaultChannel={inviteChannel} onDone={() => setInviting(false)} />
        </Dialog>
      ) : null}

      <MemberList items={items} canEdit={canEdit} currentUserId={context?.user?.id} />
      <TeamPagination path="/team?tab=members" cursor={cursor} nextCursor={nextCursor} />
    </section>
  );
}
