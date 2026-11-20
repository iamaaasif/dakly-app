import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import type { AnalyticsTab, AnalyticsTipResponse, AnalyticsView } from '@dakly/contracts/analytics';
import type { AttributionSettingsResponse, AttributionWindow } from '@dakly/contracts/stores';
import { apiFetch, ApiError } from '@dakly/ui/api-client';

import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

const REBUILD_CHECK_MS = 3000;

export function useAttributionSettings() {
  const { contextTag, request } = useStoreRequest();
  const { data: session } = useSessionContext();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['analytics', contextTag, 'attribution'],
    queryFn: ({ signal }) => request<AttributionSettingsResponse>('/store/attribution', { signal }),
    enabled: Boolean(contextTag && session?.currentStore?.canViewAnalytics),
    refetchInterval: ({ state }) => (state.data?.rebuilding ? REBUILD_CHECK_MS : false),
  });
  // Numbers on the screen come from the old window until the rebuild ends, so they are read again then.
  const wasRebuilding = useRef(false);
  useEffect(() => {
    const isRebuilding = query.data?.rebuilding === true;
    if (wasRebuilding.current && !isRebuilding)
      void client.invalidateQueries({ queryKey: ['analytics', contextTag] });
    wasRebuilding.current = isRebuilding;
  }, [client, contextTag, query.data?.rebuilding]);
  return query;
}

export function useChangeAttributionWindow() {
  const { contextTag, request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (windowDays: AttributionWindow) =>
      request<AttributionSettingsResponse>('/store/attribution', {
        method: 'PATCH',
        body: { windowDays },
      }),
    onSuccess: (settings) =>
      client.setQueryData(['analytics', contextTag, 'attribution'], settings),
  });
}

export function useAnalyticsTip(period: AnalyticsView['period']) {
  const { contextTag, request } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: ['analytics', contextTag, 'tip', period],
    queryFn: ({ signal }) =>
      request<AnalyticsTipResponse>(`/analytics/tip?period=${period}`, { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canViewAnalytics),
    // The API keeps one tip per day, so there is nothing new to read sooner.
    staleTime: 5 * 60 * 1000,
  });
}

export function useDownloadAnalytics() {
  const { contextTag } = useStoreRequest();
  return useMutation({
    mutationFn: async ({ tab, period }: { tab: AnalyticsTab; period: AnalyticsView['period'] }) => {
      if (!contextTag) throw new ApiError('STORE_REQUIRED', 'Choose a shop to continue.');
      const response = await apiFetch(`/api/analytics/export?tab=${tab}&period=${period}`, {
        context: { header: 'X-Session-Context', tag: contextTag },
      });
      const name = /filename="([^"]+)"/.exec(
        response.headers.get('content-disposition') ?? '',
      )?.[1];
      const link = document.createElement('a');
      link.href = URL.createObjectURL(await response.blob());
      link.download = name ?? 'dakly-analytics.csv';
      link.click();
      URL.revokeObjectURL(link.href);
    },
  });
}
