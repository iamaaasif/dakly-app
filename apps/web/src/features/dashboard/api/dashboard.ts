import { useQuery } from '@tanstack/react-query';

import type { DashboardQuery, DashboardResponse } from '@dakly/contracts/dashboard';

import { useStoreRequest } from '@/lib/store-request';

const dashboardKeys = { all: ['dashboard'] as const };

export function useDashboard(period: DashboardQuery['period'], hasStore: boolean) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: [...dashboardKeys.all, contextTag, period],
    // The period travels with the data so the screen can label a cached report with its own period,
    // not the one in the URL now.
    queryFn: async ({ signal }) => ({
      ...(await request<DashboardResponse>(`/dashboard?period=${period}`, { signal })),
      period,
    }),
    enabled: Boolean(contextTag && hasStore),
  });
}
