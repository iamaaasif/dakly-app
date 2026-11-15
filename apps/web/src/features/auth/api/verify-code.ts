import { announceSignIn } from '../sign-in-result';
import { useMutation } from '@tanstack/react-query';
import type { VerifyCodeInput, SignInResponse } from '@dakly/contracts/auth';
import { apiPost } from '@/lib/api-client';
export function useVerifyCode() {
  return useMutation({
    mutationFn: (input: VerifyCodeInput) =>
      apiPost<SignInResponse>('/auth/code/verify', input).then(announceSignIn),
    gcTime: 0,
  });
}
