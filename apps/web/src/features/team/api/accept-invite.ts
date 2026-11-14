import { useMutation } from '@tanstack/react-query';
import type { AcceptInviteInput, AcceptInviteResponse } from '@dakly/contracts/team';
import { apiPost } from '@/lib/api-client';
export function useAcceptInvite() {
  return useMutation({
    gcTime: 0,
    mutationFn: (input: AcceptInviteInput) =>
      apiPost<AcceptInviteResponse>('/invites/accept', input),
  });
}
