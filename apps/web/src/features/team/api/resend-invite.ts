import type { MemberResponse } from '@dakly/contracts/team';
import { useTeamMutation } from '../hooks/use-team-mutation';
export function useResendInvite(membershipId: string) {
  return useTeamMutation<void, MemberResponse>((request) =>
    request<MemberResponse>(`/members/invites/${membershipId}/resend`, {
      method: 'POST',
      body: {},
    }),
  );
}
