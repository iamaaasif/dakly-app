import type { RoleListResponse } from '@dakly/contracts/team';

import { roleLabels } from '../role-label';

type RoleOptionsProps = {
  builtInRoles: RoleListResponse['builtInRoles'];
  customRoles: RoleListResponse['items'];
  currentRoleId?: string;
};
export function RoleOptions({ builtInRoles, customRoles, currentRoleId }: RoleOptionsProps) {
  const currentIsUnloaded = currentRoleId && !customRoles.some((role) => role.id === currentRoleId);
  return (
    <>
      <option value="" disabled>
        Choose a role
      </option>
      {currentIsUnloaded ? (
        <option value={currentRoleId}>Current custom role (load more to see its name)</option>
      ) : null}
      {builtInRoles
        .filter((role) => role.builtInRole !== 'owner')
        .map((role) => (
          <option key={role.builtInRole} value={role.builtInRole}>
            {roleLabels[role.builtInRole]}
          </option>
        ))}
      {customRoles.map((role) => (
        <option key={role.id} value={role.id}>
          {role.name}
        </option>
      ))}
    </>
  );
}
