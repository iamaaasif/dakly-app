import { useState } from 'react';

import type { RoleResponse } from '@dakly/contracts/team';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

import { useRemoveRole } from '../api/remove-role';
import { PermissionSummary } from './permission-summary';
import { RoleForm } from './role-form';
import { TeamError } from './team-error';
import { SessionDialog as Dialog } from '@/components/session-dialog';

export function RoleCard({ role, canEdit }: { role: RoleResponse; canEdit: boolean }) {
  const [action, setAction] = useState<'edit' | 'delete' | null>(null);
  const remove = useRemoveRole(role.id);
  const headingId = `role-heading-${role.id}`;
  return (
    <Card
      role="article"
      aria-labelledby={headingId}
      className="flex flex-col justify-between space-y-4"
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 id={headingId} className="font-semibold break-words text-text">
            {role.name}
          </h3>
          <Badge variant="warning">Custom</Badge>
        </div>
        <PermissionSummary permissions={role.permissions} />
      </div>

      {canEdit ? (
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="secondary" onClick={() => setAction('edit')}>
            Edit role
          </Button>
          <Button variant="danger" onClick={() => setAction('delete')}>
            Delete role
          </Button>
        </div>
      ) : null}

      {action === 'edit' ? (
        <Dialog open title={`Edit ${role.name}`} onClose={() => setAction(null)}>
          <RoleForm role={role} onDone={() => setAction(null)} />
        </Dialog>
      ) : null}
      {action === 'delete' ? (
        <Dialog open title={`Delete ${role.name}?`} onClose={() => setAction(null)}>
          <p className="mb-4 text-sm text-text-muted">
            Roles still referenced by any membership cannot be deleted.
          </p>
          <TeamError message={remove.error?.message} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => remove.mutate(undefined, { onSuccess: () => setAction(null) })}
            >
              Delete role
            </Button>
          </div>
        </Dialog>
      ) : null}
    </Card>
  );
}
