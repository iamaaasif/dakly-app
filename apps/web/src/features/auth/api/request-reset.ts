import { useMutation } from '@tanstack/react-query';
import type { PasswordIdentifierInput } from '@dakly/contracts/auth';
import { apiPost } from '@/lib/api-client';
export function useRequestReset() {
  return useMutation({
    mutationFn: (input: PasswordIdentifierInput) => apiPost<void>('/auth/password-reset', input),
    gcTime: 0,
  });
}
