import { announceSignIn } from '../sign-in-result';
import { useMutation } from '@tanstack/react-query';
import type { GoogleSignInInput, GoogleSignInResponse } from '@dakly/contracts/auth';
import { apiPost } from '@/lib/api-client';
export function useGoogleSignIn() {
  return useMutation({
    mutationFn: (input: GoogleSignInInput) =>
      apiPost<GoogleSignInResponse>('/auth/google', input).then(announceSignIn),
    gcTime: 0,
  });
}
