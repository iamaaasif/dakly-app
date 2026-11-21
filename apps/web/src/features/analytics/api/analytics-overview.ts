import { useQuery } from '@tanstack/react-query';

import type {
  AnalyticsAiAgentResponse,
  AnalyticsAutomationsResponse,
  AnalyticsCampaignsResponse,
  AnalyticsChannelsResponse,
  AnalyticsOverviewResponse,
  AnalyticsProfitResponse,
  AnalyticsSocialPostsResponse,
  AnalyticsView,
} from '@dakly/contracts/analytics';

import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

export function analyticsHref({ tab, period, compare, sort, channel, search }: AnalyticsView) {
  const params = new URLSearchParams({ tab, period: String(period) });
  if (!compare) params.set('compare', 'off');
  if (tab === 'campaigns') {
    if (sort !== 'earned') params.set('sort', sort);
    if (channel !== 'all') params.set('channel', channel);
    if (search) params.set('search', search);
  }
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

function useAnalyticsTab<Response>(
  tab: 'campaigns' | 'automations' | 'channels' | 'social-posts' | 'ai-agent' | 'profit',
  period: AnalyticsView['period'],
) {
  const { contextTag, request } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: ['analytics', contextTag, tab, period],
    queryFn: ({ signal }) => request<Response>(`/analytics/${tab}?period=${period}`, { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canViewAnalytics),
  });
}

export const useAnalyticsCampaigns = (period: AnalyticsView['period']) =>
  useAnalyticsTab<AnalyticsCampaignsResponse>('campaigns', period);

export const useAnalyticsAutomations = (period: AnalyticsView['period']) =>
  useAnalyticsTab<AnalyticsAutomationsResponse>('automations', period);

export const useAnalyticsChannels = (period: AnalyticsView['period']) =>
  useAnalyticsTab<AnalyticsChannelsResponse>('channels', period);

export const useAnalyticsSocialPosts = (period: AnalyticsView['period']) =>
  useAnalyticsTab<AnalyticsSocialPostsResponse>('social-posts', period);

export const useAnalyticsAiAgent = (period: AnalyticsView['period']) =>
  useAnalyticsTab<AnalyticsAiAgentResponse>('ai-agent', period);

export const useAnalyticsProfit = (period: AnalyticsView['period']) =>
  useAnalyticsTab<AnalyticsProfitResponse>('profit', period);
