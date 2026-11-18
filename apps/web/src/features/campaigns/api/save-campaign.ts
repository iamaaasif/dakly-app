import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';

import type {
  CampaignResponse,
  ChangeCampaignInput,
  createCampaignSchema,
} from '@dakly/contracts/campaigns';

import { campaignKeys } from './campaigns-key';
import { useStoreRequest } from '@/lib/store-request';

export function useSaveCampaign() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      change:
        | { id: string; input: ChangeCampaignInput }
        | { input: z.input<typeof createCampaignSchema> },
    ) =>
      'id' in change
        ? request<CampaignResponse>(`/campaigns/${change.id}`, {
            method: 'PATCH',
            body: change.input,
          })
        : request<CampaignResponse>('/campaigns', { method: 'POST', body: change.input }),
    onSuccess: (saved) => {
      client.setQueryData(campaignKeys.detail(contextTag, saved.id), saved);
      return client.invalidateQueries({ queryKey: campaignKeys.list(contextTag) });
    },
  });
}
