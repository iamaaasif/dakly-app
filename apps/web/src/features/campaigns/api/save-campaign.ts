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
    onError: async (error, change) => {
      if (!('id' in change) || !(error instanceof ApiError)) return;
      const queryKey = campaignKeys.detail(contextTag, change.id);
      if (error.code === 'CAMPAIGN_NOT_FOUND') {
        await client.cancelQueries({ queryKey, exact: true });
        client.setQueryData(queryKey, null);
      }
      if (error.code === 'CAMPAIGN_NOT_DRAFT') await client.resetQueries({ queryKey, exact: true });
    },
    onSuccess: async (saved, change) => {
      const detail = campaignKeys.detail(contextTag, saved.id);
      await client.cancelQueries({ queryKey: detail, exact: true });
      client.setQueryData<CampaignResponse | null>(detail, (current) =>
        current === null ||
        (current && (current.status !== 'draft' || current.updatedAt > saved.updatedAt))
          ? current
          : saved,
      );
      await client.invalidateQueries({ queryKey: campaignKeys.list(contextTag) });
      if ('id' in change) void client.invalidateQueries({ queryKey: detail, exact: true });
    },
  });
  return {
    ...save,
    isSaving: () => client.isMutating({ mutationKey, exact: true }) > 0,
    getCachedCampaign: (id: string) =>
      client.getQueryData<CampaignResponse | null>(campaignKeys.detail(contextTag, id)),
  };
}
