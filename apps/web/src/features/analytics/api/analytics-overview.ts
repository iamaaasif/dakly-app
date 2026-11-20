import { useQuery } from '@tanstack/react-query';

import type { AnalyticsOverviewResponse, AnalyticsView } from '@dakly/contracts/analytics';

import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

export function analyticsHref({ tab, period, compare }: AnalyticsView) {
  const params = new URLSearchParams({ tab, period: String(period) });
  if (!compare) params.set('compare', 'off');
  return `/analytics?${params}`;
}

export function useAnalyticsOverview(period: AnalyticsView['period']) {
  const { contextTag, request } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: ['analytics', contextTag, 'overview', period],
    queryFn: ({ signal }) =>
      request<AnalyticsOverviewResponse>(`/analytics/overview?period=${period}`, { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canViewAnalytics),
  });
}
