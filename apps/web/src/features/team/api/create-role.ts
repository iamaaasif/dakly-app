import type { CreateRoleInput, RoleResponse } from '@dakly/contracts/team';
import { useTeamMutation } from '../hooks/use-team-mutation';
export function useCreateRole() {
  return useTeamMutation<CreateRoleInput, RoleResponse>((request, input) =>
    request<RoleResponse>('/roles', { method: 'POST', body: input }),
  );
}
