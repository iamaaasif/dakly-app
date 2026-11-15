import { useQuery, useMutation } from '@tanstack/react-query';

import type {
  StaffAuditPage,
  StaffAuditSearch,
  StaffAuditExportResponse,
} from '@dakly/contracts/staff-audit';

import { auditKeys } from './audit-keys';
import { adminApi } from '@/lib/api-client';

export function useAudit(query: string) {
  return useQuery({
    queryKey: auditKeys.search(query),
    queryFn: () => adminApi<StaffAuditPage>(`audit?${query}`),
  });
}
export function useAuditExport() {
  return useMutation({
    mutationFn: (input: { filter: StaffAuditSearch; reason: string }) =>
      adminApi<{ id: string }>('audit/exports', input),
  });
}
export function useExportStatus(id: string | undefined) {
  return useQuery({
    queryKey: auditKeys.export(id),
    enabled: Boolean(id),
    queryFn: () => adminApi<StaffAuditExportResponse>(`audit/exports/${id}`),
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 3000 : false),
  });
}
