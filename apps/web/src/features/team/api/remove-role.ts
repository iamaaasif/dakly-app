import { useTeamMutation } from '../hooks/use-team-mutation';
export function useRemoveRole(roleId: string) {
  return useTeamMutation<void, void>((request) =>
    request<void>(`/roles/${roleId}`, { method: 'DELETE' }),
  );
}
