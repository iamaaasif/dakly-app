import type { ChangeRoleInput, RoleResponse } from '@dakly/contracts/team';
import { useTeamMutation } from '../hooks/use-team-mutation';
export function useChangeRole(roleId: string) {
  return useTeamMutation<ChangeRoleInput, RoleResponse>((request, input) =>
    request<RoleResponse>(`/roles/${roleId}`, { method: 'PATCH', body: input }),
  );
}
