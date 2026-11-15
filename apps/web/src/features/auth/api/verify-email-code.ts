import { announceSignIn } from '../sign-in-result';
import { useMutation } from '@tanstack/react-query';
import type { VerifyEmailCodeInput, SignInResponse } from '@dakly/contracts/auth';
import { apiPost } from '@/lib/api-client';
export function useVerifyEmailCode() {
  return useMutation({
    mutationFn: (input: VerifyEmailCodeInput) =>
      apiPost<SignInResponse>('/auth/email/code/verify', input).then(announceSignIn),
    gcTime: 0,
  });
}
