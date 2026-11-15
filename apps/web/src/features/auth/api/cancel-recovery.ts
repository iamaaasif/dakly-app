import { useMutation } from '@tanstack/react-query';
import type { TotpRecoveryTokenInput } from '@dakly/contracts/totp';
import { apiPost } from '@/lib/api-client';
export function useCancelRecovery() {
  return useMutation({
    mutationFn: (input: TotpRecoveryTokenInput) =>
      apiPost<void>('/auth/totp/recovery/cancel', input),
    gcTime: 0,
  });
}
