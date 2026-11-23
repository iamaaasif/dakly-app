import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AdLink, AdLinkSource, AdList } from '@dakly/contracts/ad-links';
import type { ProductListResponse } from '@dakly/contracts/products';

import { aiAgentKeys } from './ai-agent-keys';
import { useStoreRequest } from '@/lib/store-request';

type AdKey = { source: AdLinkSource; externalId: string };

export function useAds() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: aiAgentKeys.ads(contextTag),
    enabled: Boolean(contextTag),
    retry: false,
    queryFn: ({ signal }) => request<AdList>('/ads', { signal }),
  });
}

// Every change reads the list again, so a status never shows what the shop no longer has.
function useAdMutation<T>(
  call: (
    key: AdKey,
    request: ReturnType<typeof useStoreRequest>['request'],
    input: T,
  ) => Promise<unknown>,
) {
  const store = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ key, input }: { key: AdKey; input: T }) => call(key, store.request, input),
    onSuccess: () => client.invalidateQueries({ queryKey: aiAgentKeys.ads(store.contextTag) }),
  });
}

export function useConfirmAdSuggestions() {
  return useAdMutation<undefined>(({ source, externalId }, request) =>
    request<AdLink>(`/ads/${source}/${externalId}/confirm`, { method: 'POST' }),
  );
}

export function useDismissAdSuggestions() {
  return useAdMutation<undefined>(({ source, externalId }, request) =>
    request<void>(`/ads/${source}/${externalId}/suggestions`, { method: 'DELETE' }),
  );
}

export function useSetAdProducts() {
  return useAdMutation<string[]>(({ source, externalId }, request, productIds) =>
    request<AdLink>(`/ad-links/${source}/${externalId}`, { method: 'PUT', body: { productIds } }),
  );
}

// The owner picks from the shop's products; a search of 3 letters or more narrows the list.
export function useAdProductSearch(term: string) {
  const { request, contextTag } = useStoreRequest();
  const query = new URLSearchParams({ limit: '20' });
  if (term.length >= 3) query.set('search', term);
  return useQuery({
    queryKey: [...aiAgentKeys.ads(contextTag), 'products', term],
    enabled: Boolean(contextTag),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => request<ProductListResponse>(`/products?${query}`, { signal }),
  });
}
