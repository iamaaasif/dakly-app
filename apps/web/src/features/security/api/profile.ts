import { useQuery } from '@tanstack/react-query';
import type { AccountProfile } from '@dakly/contracts/sessions';
import { useAccountRequest } from '@/lib/account-request';
export function useProfile() {
  const { request, contextTag } = useAccountRequest();
  return useQuery({
    queryKey: ['account-security', contextTag, 'profile'],
    enabled: Boolean(contextTag),
    retry: false,
    queryFn: ({ signal }) => request<AccountProfile>('/me', { signal }),
  });
}
