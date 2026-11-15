import { notifySessionChange } from '@/lib/notify-session-change';
import { useMutation } from '@tanstack/react-query';
import type { TotpSignInInput } from '@dakly/contracts/totp';
import { apiPost } from '@/lib/api-client';
export function useVerifyTotp() {
  return useMutation({
    mutationFn: (input: TotpSignInInput) =>
      apiPost<void>('/auth/totp', input).then((result) => {
        notifySessionChange();
        return result;
      }),
    gcTime: 0,
  });
}
