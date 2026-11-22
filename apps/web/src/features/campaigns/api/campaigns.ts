import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { CampaignListQuery, CampaignListResponse } from '@dakly/contracts/campaigns';

import { campaignKeys } from './campaigns-key';
import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

export function campaignListHref(query: Partial<CampaignListQuery> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  return params.size ? `/campaigns?${params}` : '/campaigns';
}

export function useCampaigns(query: CampaignListQuery) {
  const { contextTag, request } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: [...campaignKeys.list(contextTag), query],
    queryFn: ({ signal }) => request<CampaignListResponse>(campaignListHref(query), { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canViewCampaigns),
    placeholderData: keepPreviousData,
  });
}
