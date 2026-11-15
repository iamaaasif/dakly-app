import { useTeamMutation } from '../hooks/use-team-mutation';

export function useRemoveMember(membershipId: string) {
  return useTeamMutation<void, void>((request) =>
    request<void>(`/members/${membershipId}`, { method: 'DELETE' }),
  );
}
