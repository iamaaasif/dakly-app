import { useMutation } from '@tanstack/react-query';

import type { RequestCodeInput } from '@dakly/contracts/auth';

import { apiPost } from '@/lib/api-client';

export function useRequestCode() {
  return useMutation({
    mutationFn: (input: RequestCodeInput) => apiPost<void>('/auth/code', input),
    gcTime: 0,
  });
}
