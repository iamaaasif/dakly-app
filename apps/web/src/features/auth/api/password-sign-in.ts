import { useMutation } from '@tanstack/react-query';

import type { PasswordSignInInput, SignInResponse } from '@dakly/contracts/auth';

import { announceSignIn } from '../sign-in-result';
import { apiPost } from '@/lib/api-client';

export function usePasswordSignIn() {
  return useMutation({
    mutationFn: (input: PasswordSignInInput) =>
      apiPost<SignInResponse>('/auth/password', input).then(announceSignIn),
    gcTime: 0,
  });
}
