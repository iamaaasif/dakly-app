import { permissionAreas } from '@dakly/contracts/team';

import { PermissionAreaField } from './permission-area-field';
import { PermissionFlagField } from './permission-flag-field';

export function PermissionFields() {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 font-semibold">Permissions</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {permissionAreas.map((area) => (
          <PermissionAreaField key={area} area={area} />
        ))}
      </div>
      {(['seeFullPhone', 'exportLists', 'refund'] as const).map((flag) => (
        <PermissionFlagField key={flag} flag={flag} />
      ))}
      <p className="text-sm text-text-muted">
        Changes apply to every member assigned this role. Billing edit and ownership remain
        Owner-only.
      </p>
    </fieldset>
  );
}
