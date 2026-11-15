import { useQuery } from '@tanstack/react-query';

import type { AccountProfile } from '@dakly/contracts/sessions';

import { securityKeys } from './security-keys';
import { useAccountRequest } from '@/lib/account-request';

export function useProfile() {
  const { request, contextTag } = useAccountRequest();
  return useQuery({
    queryKey: securityKeys.profile(contextTag),
    enabled: Boolean(contextTag),
    retry: false,
    queryFn: ({ signal }) => request<AccountProfile>('/me', { signal }),
  });
}
