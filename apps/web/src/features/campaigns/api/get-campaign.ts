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
    queryFn: ({ signal }) =>
      request<CampaignResponse>(`/campaigns/${campaignId}`, { signal }).catch((error: unknown) => {
        if (error instanceof ApiError && error.code === 'CAMPAIGN_NOT_FOUND') return null;
        throw error;
      }),
    enabled: Boolean(contextTag && data?.currentStore?.canViewCampaigns),
    // The audience is checked in the background after Approve; the page follows it.
    refetchInterval: (query) => (query.state.data?.status === 'approving' ? 2000 : false),
  });
}
