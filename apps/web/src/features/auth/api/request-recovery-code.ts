import { useMutation } from '@tanstack/react-query';
import type { TotpRecoveryCodeInput } from '@dakly/contracts/totp';
import { apiPost } from '@/lib/api-client';
export function useRequestRecoveryCode() {
  return useMutation({
    mutationFn: (input: TotpRecoveryCodeInput) => apiPost<void>('/auth/totp/recovery/code', input),
    gcTime: 0,
  });
}
