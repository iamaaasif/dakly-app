import { permissionAreas } from '@dakly/contracts/team';

import { PermissionAreaField } from './permission-area-field';
import { PermissionFlagField } from './permission-flag-field';

export function PermissionFields() {
  return (
    <div className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="font-semibold text-text">What they can do</legend>
        <p className="text-xs text-text-muted">
          &quot;View&quot; lets them look. &quot;Edit&quot; lets them make changes too.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {permissionAreas.map((area) => (
            <PermissionAreaField key={area} area={area} />
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3 border-t border-border pt-4">
        <legend className="font-semibold text-text">Customer privacy</legend>
        <p className="text-xs text-text-muted">
          Keep your customers&apos; details safe. Only turn these on for people you trust.
        </p>
        <div className="space-y-3">
          {(['seeFullPhone', 'exportLists', 'refund'] as const).map((flag) => (
            <PermissionFlagField key={flag} flag={flag} />
          ))}
        </div>
      </fieldset>

      <p className="text-xs text-text-muted">
        Changes apply to every member assigned this role. Billing edit and ownership remain
        Owner-only.
      </p>
    </div>
  );
}
