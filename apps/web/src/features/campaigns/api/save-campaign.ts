import { useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  CampaignResponse,
  ChangeCampaignInput,
  CreateCampaignInput,
} from '@dakly/contracts/campaigns';

import { campaignsKey } from './campaigns-key';
import { useStoreRequest } from '@/lib/store-request';

export function useSaveCampaign() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      change: { id: string; input: ChangeCampaignInput } | { input: CreateCampaignInput },
    ) =>
      'id' in change
        ? request<CampaignResponse>(`/campaigns/${change.id}`, {
            method: 'PATCH',
            body: change.input,
          })
        : request<CampaignResponse>('/campaigns', { method: 'POST', body: change.input }),
    onSuccess: async (saved) => {
      const detail = [...campaignsKey, contextTag, 'detail', saved.id];
      await client.cancelQueries({ queryKey: detail, exact: true });
      client.setQueryData(detail, saved);
      return client.invalidateQueries({ queryKey: [...campaignsKey, contextTag, 'list'] });
    },
  });
}
