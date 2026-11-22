import { useQuery } from '@tanstack/react-query';

import type { SessionContext } from '@dakly/contracts/sessions';

import { apiRequest } from './api-client';

export const sessionContextKey = ['session-context'] as const;
export function useSessionContext(initialData?: SessionContext) {
  return useQuery({
    queryKey: sessionContextKey,
    queryFn: ({ signal }) => apiRequest<SessionContext>('/me/context', { signal }),
    initialData,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}
