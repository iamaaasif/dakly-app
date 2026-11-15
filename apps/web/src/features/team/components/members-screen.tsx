'use client';
import { useState } from 'react';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { SessionDialog as Dialog } from '@/components/session-dialog';
import { useSessionContext } from '@/lib/session-context';
import { useMembers } from '../api/members';
import { MemberCard } from './member-card';
import { InviteForm } from './invite-form';
import { TeamLoading } from './team-loading';
import { TeamPagination } from './team-pagination';
export function MembersScreen({ cursor }: { cursor?: string }) {
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
      <h2 className="text-lg font-semibold">Members</h2>
      <p>
        {seats.used} of {seats.limit} seats used
      </p>
      <meter
        className="h-4 w-full"
        min={0}
        max={seats.limit}
        value={seats.used}
        aria-label="Team seats"
      />
      {seats.used >= seats.limit ? (
        <p role="status">
          Your plan’s {seats.limit} team seats are in use. Remove a member or cancel an invitation
          to free a seat.
        </p>
      ) : null}
      {canEdit ? (
        <Button disabled={seats.used >= seats.limit} onClick={() => setInviting(true)}>
          Invite member
        </Button>
      ) : (
        <p>You can view the team. Team editing is not available with your current access.</p>
      )}
      {inviting ? (
        <Dialog open title="Invite a team member" onClose={() => setInviting(false)}>
          <InviteForm onDone={() => setInviting(false)} />
        </Dialog>
      ) : null}
      {!items.length ? (
        <p>No members on this page. Return to the first page or invite a member.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((member) => (
            <MemberCard key={member.id} member={member} canEdit={canEdit} />
          ))}
        </div>
      )}
      <TeamPagination path="/team?tab=members" cursor={cursor} nextCursor={nextCursor} />
    </section>
  );
}
