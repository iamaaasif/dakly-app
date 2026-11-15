import type { MemberRoleInput, MemberResponse } from '@dakly/contracts/team';
import { useTeamMutation } from '../hooks/use-team-mutation';
export function useChangeMember(membershipId: string) {
  return useTeamMutation<MemberRoleInput, MemberResponse>((request, input) =>
    request<MemberResponse>(`/members/${membershipId}`, { method: 'PATCH', body: input }),
  );
}
