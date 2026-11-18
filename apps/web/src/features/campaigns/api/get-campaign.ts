import { useQuery } from '@tanstack/react-query';

import type { CampaignResponse } from '@dakly/contracts/campaigns';

import { campaignsKey } from './campaigns-key';
import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

export function useCampaign(campaignId: string) {
  const { contextTag, request } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: [...campaignsKey, contextTag, 'detail', campaignId],
    queryFn: ({ signal }) => request<CampaignResponse>(`/campaigns/${campaignId}`, { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canViewCampaigns),
  });
}
