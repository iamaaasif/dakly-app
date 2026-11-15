import { useQuery } from '@tanstack/react-query';
import type { AccountSecurityHistoryPage } from '@dakly/contracts/account-security-events';
export function useSecurityHistory(before: string) {
  return useQuery({
    queryKey: ['security-history', before],
    retry: false,
    queryFn: async (): Promise<AccountSecurityHistoryPage> => {
      const response = await fetch(`/api/me/security-history${before ? '?before=' + before : ''}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? 'Sign in to see your security history.'
            : 'Could not load security history. Try again.',
        );
      return response.json();
    },
  });
}
