import { useMutation } from '@tanstack/react-query';
import type { TotpRecoveryInput, TotpRecoveryResponse } from '@dakly/contracts/totp';
import { apiPost } from '@/lib/api-client';
export function useStartRecovery() {
  return useMutation({
    mutationFn: (input: TotpRecoveryInput) =>
      apiPost<TotpRecoveryResponse>('/auth/totp/recovery', input),
    gcTime: 0,
  });
}
