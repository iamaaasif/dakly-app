import { useQuery } from '@tanstack/react-query';

import type { CampaignResponse } from '@dakly/contracts/campaigns';
import { ApiError } from '@dakly/ui/api-client';

import { campaignKeys } from './campaigns-key';
import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

export function useCampaign(campaignId: string) {
  const { contextTag, request } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: campaignKeys.detail(contextTag, campaignId),
    queryFn: ({ signal }) => request<CampaignResponse>(`/campaigns/${campaignId}`, { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canViewCampaigns),
    retry: (failureCount, error) =>
      failureCount < 3 && !(error instanceof ApiError && error.code === 'CAMPAIGN_NOT_FOUND'),
  });
}
