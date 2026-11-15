import { useMutation } from '@tanstack/react-query';
import type { RequestEmailCodeInput } from '@dakly/contracts/auth';
import { apiPost } from '@/lib/api-client';
export function useRequestEmailCode() {
  return useMutation({
    mutationFn: (input: RequestEmailCodeInput) => apiPost<void>('/auth/email/code', input),
    gcTime: 0,
  });
}
