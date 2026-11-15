import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StaffAlertPage } from '@dakly/contracts/break-glass';
import { adminApi } from '@/lib/api-client';
const alertKeys = {
  all: ['staff-alerts'] as const,
  page: (before: string) => ['staff-alerts', before] as const,
};
export function useStaffAlerts(before: string) {
  return useQuery({
    queryKey: alertKeys.page(before),
    queryFn: () => adminApi<StaffAlertPage>(`alerts${before ? '?before=' + before : ''}`),
  });
}
export function useRetryAlert() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi(`alerts/${id}/retry`, { reason }),
    onSuccess: () => client.invalidateQueries({ queryKey: alertKeys.all }),
  });
}
