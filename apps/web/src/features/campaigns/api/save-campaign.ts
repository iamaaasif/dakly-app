import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';

import type {
  CampaignResponse,
  ChangeCampaignInput,
  CreateCampaignInput,
} from '@dakly/contracts/campaigns';

import { campaignKeys } from './campaigns-key';
import { useStoreRequest } from '@/lib/store-request';

export function useSaveCampaign() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  const mutationKey = ['save-campaign', useId()] as const;
  const save = useMutation({
    mutationKey,
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
      const detail = campaignKeys.detail(contextTag, saved.id);
      await client.cancelQueries({ queryKey: detail, exact: true });
      client.setQueryData(detail, saved);
      return client.invalidateQueries({ queryKey: campaignKeys.list(contextTag) });
    },
  });
  return { ...save, isSaving: () => client.isMutating({ mutationKey, exact: true }) > 0 };
}
