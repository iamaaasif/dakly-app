import { useState } from 'react';
import type { RoleResponse } from '@dakly/contracts/team';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { SessionDialog as Dialog } from '@/components/session-dialog';
import { useRemoveRole } from '../api/remove-role';
import { RoleForm } from './role-form';
import { PermissionSummary } from './permission-summary';
import { TeamError } from './team-error';
export function RoleCard({ role, canEdit }: { role: RoleResponse; canEdit: boolean }) {
  const [action, setAction] = useState<'edit' | 'delete' | null>(null);
  const remove = useRemoveRole(role.id);
  return (
    <Card className="space-y-3">
      <h3 className="font-semibold break-words">{role.name}</h3>
      <PermissionSummary permissions={role.permissions} />
      {canEdit ? (
        <div className="flex gap-2">
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
          <p className="mb-4">Roles still referenced by any membership cannot be deleted.</p>
          <TeamError message={remove.error?.message} />
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => remove.mutate(undefined, { onSuccess: () => setAction(null) })}
          >
            Delete role
          </Button>
        </Dialog>
      ) : null}
    </Card>
  );
}
