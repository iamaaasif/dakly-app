import { useQuery } from '@tanstack/react-query';

import type { AuditLogPage } from '@dakly/contracts/audit';

import { apiRequest } from '@/lib/api-client';
import { useSessionContext } from '@/lib/session-context';

export function useAuditLog(before: string) {
  const { data: session } = useSessionContext();
  const contextTag = session?.contextTag;
  return useQuery({
    queryKey: ['audit-log', contextTag, before],
    enabled: Boolean(contextTag),
    retry: false,
    queryFn: ({ signal }) =>
      apiRequest<AuditLogPage>(`/audit-log${before ? `?before=${before}` : ''}`, {
        signal,
        contextTag,
      }),
  });
}
