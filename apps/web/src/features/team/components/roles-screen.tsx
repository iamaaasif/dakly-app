'use client';
import { useState } from 'react';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { Card } from '@dakly/ui/card';
import { SessionDialog as Dialog } from '@/components/session-dialog';
import { useSessionContext } from '@/lib/session-context';
import { useRoles } from '../api/roles';
import { roleLabels } from '../role-label';
import { RoleCard } from './role-card';
import { RoleForm } from './role-form';
import { PermissionSummary } from './permission-summary';
import { TeamLoading } from './team-loading';
import { TeamPagination } from './team-pagination';
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
  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold">Roles</h2>
      <h3 className="font-semibold">Built-in roles</h3>
      <p>Built-in roles are read-only.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {roles.data.builtInRoles.map((role) => (
          <Card key={role.builtInRole}>
            <h4 className="font-semibold">{roleLabels[role.builtInRole]}</h4>
            <PermissionSummary permissions={role.permissions} />
          </Card>
        ))}
      </div>
      <h3 className="font-semibold">Custom roles</h3>
      {canEdit ? (
        <Button onClick={() => setCreating(true)}>Create role</Button>
      ) : (
        <p>You can view roles with your current access.</p>
      )}
      {creating ? (
        <Dialog open title="Create a custom role" onClose={() => setCreating(false)}>
          <RoleForm onDone={() => setCreating(false)} />
        </Dialog>
      ) : null}
      {!roles.data.items.length ? (
        <p>No custom roles on this page.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {roles.data.items.map((role) => (
            <RoleCard key={role.id} role={role} canEdit={canEdit} />
          ))}
        </div>
      )}
      <TeamPagination path="/team?tab=roles" cursor={cursor} nextCursor={roles.data.nextCursor} />
    </section>
  );
}
