import type { InviteMemberInput, MemberResponse } from '@dakly/contracts/team';
import { useTeamMutation } from '../hooks/use-team-mutation';
export function useInviteMember() {
  return useTeamMutation<InviteMemberInput, MemberResponse>((request, input) =>
    request<MemberResponse>('/members/invites', { method: 'POST', body: input }),
  );
}
