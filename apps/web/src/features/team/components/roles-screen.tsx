'use client';
import { Shield } from 'lucide-react';
import { useState } from 'react';

import type { RoleListResponse } from '@dakly/contracts/team';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { QueryError } from '@dakly/ui/query-error';

import { useRoles } from '../api/roles';
import { roleLabels } from '../role-label';
import { PermissionSummary } from './permission-summary';
import { RoleCard } from './role-card';
import { RoleForm } from './role-form';
import { TeamLoading } from './team-loading';
import { TeamPagination } from './team-pagination';
import { SessionDialog as Dialog } from '@/components/session-dialog';
import { useSessionContext } from '@/lib/session-context';

const builtInDescriptions: Record<string, string> = {
  owner: 'Full access, including billing and closing the store. There is always one owner.',
  admin: 'Runs the store day to day. Everything except billing.',
  marketer: 'Creates campaigns, posts and automations, and sees the results.',
  support_agent: 'Replies to customers in Inbox and checks their orders.',
};

type BuiltInRole = RoleListResponse['builtInRoles'][number];
type CustomRole = RoleListResponse['items'][number];

function BuiltInRoleCard({ role }: { role: BuiltInRole }) {
  return (
    <Card className="flex flex-col justify-between space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-semibold text-text">{roleLabels[role.builtInRole]}</h4>
          <Badge variant="neutral">Built-in</Badge>
        </div>
        <p className="text-sm text-text-muted">
          {builtInDescriptions[role.builtInRole] ?? 'Built-in system role.'}
        </p>
        <PermissionSummary permissions={role.permissions} />
      </div>

      <div className="flex items-center gap-1.5 border-t border-border pt-3 text-xs text-text-muted">
        <Shield className="size-3.5" aria-hidden="true" />
        <span>Built-in role</span>
      </div>
    </Card>
  );
}

function CustomRolesList({ roles, canEdit }: { roles: CustomRole[]; canEdit: boolean }) {
  if (!roles.length) {
    return <p className="text-sm text-text-muted">No custom roles on this page.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {roles.map((role) => (
        <RoleCard key={role.id} role={role} canEdit={canEdit} />
      ))}
    </div>
  );
}

export function RolesScreen({ cursor }: { cursor?: string }) {
  const roles = useRoles(cursor);
  const { data: context } = useSessionContext();
  const [creating, setCreating] = useState(false);

  if (roles.isPending) return <TeamLoading />;
  if (roles.error)
    return (
      <QueryError
        message={roles.error.message}
        onRetry={() => void roles.refetch()}
        retryLabel="Retry roles"
      />
    );
  const canEdit = Boolean(context?.currentStore?.canEditTeam);
  const totalRoles = roles.data.builtInRoles.length + roles.data.items.length;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Roles ({totalRoles})</h2>
          <p className="text-sm text-text-muted">Built-in roles are read-only.</p>
        </div>
        {canEdit ? (
          <Button onClick={() => setCreating(true)} className="self-start sm:self-auto">
            <Shield className="size-4" aria-hidden="true" />
            Create role
          </Button>
        ) : (
          <p className="text-sm text-text-muted">You can view roles with your current access.</p>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold tracking-wider text-text-muted uppercase">
          Built-in roles
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roles.data.builtInRoles.map((role) => (
            <BuiltInRoleCard key={role.builtInRole} role={role} />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold tracking-wider text-text-muted uppercase">
          Custom roles
        </h3>
        <CustomRolesList roles={roles.data.items} canEdit={canEdit} />
      </div>

      {creating ? (
        <Dialog open title="Create a custom role" onClose={() => setCreating(false)}>
          <RoleForm onDone={() => setCreating(false)} />
        </Dialog>
      ) : null}

      <TeamPagination path="/team?tab=roles" cursor={cursor} nextCursor={roles.data.nextCursor} />
    </section>
  );
}
