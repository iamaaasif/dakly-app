import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CampaignResponse } from '@dakly/contracts/campaigns';

import { campaignKeys } from './campaigns-key';
import { useStoreRequest } from '@/lib/store-request';

export function useApproveCampaign() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) =>
      request<CampaignResponse>(`/campaigns/${campaignId}/approve`, { method: 'POST' }),
    onSuccess: (approving) => {
      client.setQueryData(campaignKeys.detail(contextTag, approving.id), approving);
      return client.invalidateQueries({ queryKey: campaignKeys.list(contextTag) });
    },
  });
}
