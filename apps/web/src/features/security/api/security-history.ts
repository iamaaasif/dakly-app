import { useQuery } from '@tanstack/react-query';
import type { AccountSecurityHistoryPage } from '@dakly/contracts/account-security-events';
import { apiRequest } from '@/lib/api-client';
import { useSessionContext } from '@/lib/session-context';

export function useSecurityHistory(before: string) {
  const { data: session } = useSessionContext();
  const contextTag = session?.contextTag;
  return useQuery({
    queryKey: ['security-history', contextTag, before],
    enabled: Boolean(contextTag),
    retry: false,
    queryFn: ({ signal }) =>
      apiRequest<AccountSecurityHistoryPage>(
        `/me/security-history${before ? '?before=' + before : ''}`,
        { signal, contextTag },
      ),
  });
}
