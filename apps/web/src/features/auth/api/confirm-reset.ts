import { notifySessionChange } from '@/lib/notify-session-change';
import { useMutation } from '@tanstack/react-query';
import type { ConfirmPasswordResetInput, SignInResponse } from '@dakly/contracts/auth';
import { apiPost } from '@/lib/api-client';
export function useConfirmReset() {
  return useMutation({
    mutationFn: (input: ConfirmPasswordResetInput) =>
      apiPost<SignInResponse>('/auth/password-reset/confirm', input).then((result) => {
        notifySessionChange();
        return result;
      }),
    gcTime: 0,
  });
}
