import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CampaignCustomersResponse,
  CampaignOutcome,
  CampaignResponse,
  CampaignResultsResponse,
} from '@dakly/contracts/campaigns';

import { campaignKeys } from './campaigns-key';
import { useStoreRequest } from '@/lib/store-request';

export function useCampaignResults(campaignId: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: campaignKeys.results(contextTag, campaignId),
    queryFn: ({ signal }) =>
      request<CampaignResultsResponse>(`/campaigns/${campaignId}/results`, { signal }),
    enabled: Boolean(contextTag),
    retry: false,
  });
}

export function useCampaignCustomers(campaignId: string, outcome: CampaignOutcome) {
  const { request, contextTag } = useStoreRequest();
  return useInfiniteQuery({
    queryKey: campaignKeys.customers(contextTag, campaignId, outcome),
    queryFn: ({ signal, pageParam }) => {
      const params = new URLSearchParams({ outcome });
      if (pageParam) params.set('cursor', pageParam);
      return request<CampaignCustomersResponse>(`/campaigns/${campaignId}/customers?${params}`, {
        signal,
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(contextTag),
    retry: false,
  });
}

export type CampaignCopyKind = 'duplicate' | 'resend' | 'follow-up';

// Each action makes a new draft; the caller opens it in the builder.
export function useCopyCampaign(campaignId: string) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (kind: CampaignCopyKind) =>
      request<CampaignResponse>(`/campaigns/${campaignId}/${kind}`, { method: 'POST' }),
    onSuccess: (draft) => {
      client.setQueryData(campaignKeys.detail(contextTag, draft.id), draft);
      return client.invalidateQueries({ queryKey: campaignKeys.list(contextTag) });
    },
  });
}
