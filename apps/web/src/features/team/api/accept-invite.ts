import { useMutation } from '@tanstack/react-query';

import type { AcceptInviteInput, AcceptInviteResponse } from '@dakly/contracts/team';

import { apiPost } from '@/lib/api-client';
import { useSessionContext } from '@/lib/session-context';

export function useAcceptInvite() {
  const { data: session } = useSessionContext();
  return useMutation({
    gcTime: 0,
    mutationFn: (input: AcceptInviteInput) =>
      apiPost<AcceptInviteResponse>('/invites/accept', input, { contextTag: session?.contextTag }),
  });
}
