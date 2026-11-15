import { announceSignIn } from '../sign-in-result';
import { useMutation } from '@tanstack/react-query';
import type { VerifyGoogleEmailInput, GoogleSignInResponse } from '@dakly/contracts/auth';
import { apiPost } from '@/lib/api-client';
export function useVerifyGoogleEmail() {
  return useMutation({
    mutationFn: (input: VerifyGoogleEmailInput) =>
      apiPost<GoogleSignInResponse>('/auth/google/email/verify', input).then(announceSignIn),
    gcTime: 0,
  });
}
