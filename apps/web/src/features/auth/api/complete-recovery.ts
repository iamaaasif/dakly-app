import { notifySessionChange } from '@/lib/notify-session-change';
import { useMutation } from '@tanstack/react-query';
import type { TotpRecoveryTokenInput } from '@dakly/contracts/totp';
import { apiPost } from '@/lib/api-client';
export function useCompleteRecovery() {
  return useMutation({
    mutationFn: (input: TotpRecoveryTokenInput) =>
      apiPost<void>('/auth/totp/recovery/complete', input).then((result) => {
        notifySessionChange();
        return result;
      }),
    gcTime: 0,
  });
}
