import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId } from 'react';

import type {
  CampaignResponse,
  ChangeCampaignInput,
  CreateCampaignInput,
} from '@dakly/contracts/campaigns';
import { ApiError } from '@dakly/ui/api-client';

import { campaignKeys } from './campaigns-key';
import { useStoreRequest } from '@/lib/store-request';

export function useSaveCampaign() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  const mutationKey = ['save-campaign', useId()] as const;
  const getCachedCampaign = (id: string) =>
    client.getQueryData<CampaignResponse | null>(campaignKeys.detail(contextTag, id));
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
    onMutate: (change) => ({ before: 'id' in change ? getCachedCampaign(change.id) : undefined }),
    onError: async (error, change) => {
      if (!('id' in change) || !(error instanceof ApiError)) return;
      const queryKey = campaignKeys.detail(contextTag, change.id);
      if (error.code === 'CAMPAIGN_NOT_FOUND') {
        await client.cancelQueries({ queryKey, exact: true });
        client.setQueryData(queryKey, null);
      }
      if (error.code === 'CAMPAIGN_NOT_DRAFT') await client.resetQueries({ queryKey, exact: true });
    },
    onSuccess: async (saved, change, snapshot) => {
      const detail = campaignKeys.detail(contextTag, saved.id);
      await client.cancelQueries({ queryKey: detail, exact: true });
      const current = getCachedCampaign(saved.id);
      if (current?.status === 'draft' && current !== snapshot?.before) {
        // The overlapping read could precede or follow the commit. Load the current draft
        // before showing a saved state. A failed refresh leaves the detail available to retry.
        await client.invalidateQueries({ queryKey: detail, exact: true });
      } else if (
        current === snapshot?.before &&
        (current === undefined || current?.status === 'draft')
      ) {
        client.setQueryData(detail, saved);
        if ('id' in change) void client.invalidateQueries({ queryKey: detail, exact: true });
      }
      await client.invalidateQueries({ queryKey: campaignKeys.list(contextTag) });
    },
  });
  return {
    ...save,
    isSaving: () => client.isMutating({ mutationKey, exact: true }) > 0,
    getCachedCampaign: (id: string) =>
      client.getQueryState(campaignKeys.detail(contextTag, id))?.status === 'success'
        ? getCachedCampaign(id)
        : undefined,
  };
}
