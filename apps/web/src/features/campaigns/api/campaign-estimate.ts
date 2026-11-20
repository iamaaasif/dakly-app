import { useQuery } from '@tanstack/react-query';

import type { CampaignEstimateResponse } from '@dakly/contracts/campaigns';

import { campaignKeys } from './campaigns-key';
import { useStoreRequest } from '@/lib/store-request';

// The estimate reads the saved draft, so it refreshes after each save through the draft's
// updatedAt.
export function useCampaignEstimate(campaignId: string, savedAt: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: [...campaignKeys.estimate(contextTag, campaignId), savedAt],
    enabled: Boolean(contextTag),
    queryFn: ({ signal }) =>
      request<CampaignEstimateResponse>(`/campaigns/${campaignId}/estimate`, { signal }),
  });
}
