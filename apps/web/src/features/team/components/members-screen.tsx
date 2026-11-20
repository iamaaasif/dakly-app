'use client';
import { Search, UserPlus } from 'lucide-react';
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
      <meter
        className="h-2 w-full appearance-none rounded-full bg-surface-muted accent-primary [&::-webkit-meter-bar]:rounded-full [&::-webkit-meter-bar]:bg-surface-muted [&::-webkit-meter-optimum-value]:rounded-full [&::-webkit-meter-optimum-value]:bg-action"
        min={0}
        max={seats.limit}
        value={seats.used}
        aria-label="Team seats"
      />
      {seats.used >= seats.limit ? (
        <p role="status" className="text-xs text-warning">
          Your plan’s {seats.limit} team seats are in use. Remove a member or cancel an invitation
          to free a seat.
        </p>
      ) : null}
    </Card>
  );
}

function MemberFilters({
  query,
  setQuery,
  roleFilter,
  setRoleFilter,
}: {
  query: string;
  setQuery: (q: string) => void;
  roleFilter: string;
  setRoleFilter: (r: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="flex-1 space-y-1">
        <label htmlFor="member-search" className="block text-xs font-medium text-text-muted">
          Search members
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            id="member-search"
            type="search"
            placeholder="Search by name, phone or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-10 w-full rounded-md border border-input-border bg-surface pr-3 pl-9 text-sm focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-focus focus-visible:outline-none"
          />
        </div>
      </div>
      <div className="space-y-1 sm:w-48">
        <label htmlFor="role-filter" className="block text-xs font-medium text-text-muted">
          Filter by role
        </label>
        <select
          id="role-filter"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="min-h-10 w-full rounded-md border border-input-border bg-surface px-3 text-sm focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-focus focus-visible:outline-none"
        >
          <option value="all">All roles</option>
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="marketer">Marketer</option>
          <option value="support_agent">Support agent</option>
          <option value="custom">Custom roles</option>
        </select>
      </div>
    </div>
  );
}

function MemberList({ items, canEdit }: { items: MemberResponse[]; canEdit: boolean }) {
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
        <MemberCard key={member.id} member={member} canEdit={canEdit} />
      ))}
    </Card>
  );
}

export function MembersScreen({ cursor }: { cursor?: string }) {
  const members = useMembers(cursor);
  const { data: context } = useSessionContext();
  const [inviting, setInviting] = useState(false);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

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

  const filteredItems = items.filter((member) => {
    if (roleFilter !== 'all' && (member.builtInRole ?? 'custom') !== roleFilter) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return [member.name, member.phone, member.email].some((v) => v?.toLowerCase().includes(q));
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Members ({items.length})</h2>
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

      <MemberFilters
        query={query}
        setQuery={setQuery}
        roleFilter={roleFilter}
        setRoleFilter={setRoleFilter}
      />

      {inviting ? (
        <Dialog open title="Invite a team member" onClose={() => setInviting(false)}>
          <InviteForm onDone={() => setInviting(false)} />
        </Dialog>
      ) : null}

      <MemberList items={filteredItems} canEdit={canEdit} />
      <TeamPagination path="/team?tab=members" cursor={cursor} nextCursor={nextCursor} />
    </section>
  );
}
