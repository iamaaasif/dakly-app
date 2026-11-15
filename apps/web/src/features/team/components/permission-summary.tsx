import { permissionAreas, type RolePermissions } from '@dakly/contracts/team';

import { accessLabels, permissionLabels, flagLabels } from '../permission-labels';

export function PermissionSummary({ permissions }: { permissions: RolePermissions }) {
  return (
    <details>
      <summary className="min-h-10 cursor-pointer py-2 text-action">View permissions</summary>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {permissionAreas.map((area) => (
          <div key={area}>
            <dt className="font-medium">{permissionLabels[area]}</dt>
            <dd>{accessLabels[permissions.areas[area] ?? 'none']}</dd>
          </div>
        ))}
        {Object.entries(flagLabels).map(([flag, label]) => (
          <div key={flag}>
            <dt className="font-medium">{label}</dt>
            <dd>{permissions[flag as keyof typeof flagLabels] ? 'Allowed' : 'Not allowed'}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
