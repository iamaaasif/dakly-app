import { useQuery } from '@tanstack/react-query';

import type { DashboardQuery, DashboardResponse } from '@dakly/contracts/dashboard';

import { useStoreRequest } from '@/lib/store-request';

const dashboardKeys = { all: ['dashboard'] as const };

export function useDashboard(period: DashboardQuery['period'], hasStore: boolean) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: [...dashboardKeys.all, contextTag, period],
    queryFn: async ({ signal }) => ({
      ...(await request<DashboardResponse>(`/dashboard?period=${period}`, { signal })),
      period,
    }),
    enabled: Boolean(contextTag && hasStore),
  });
}
