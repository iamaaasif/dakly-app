import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { AreaListResponse, AreaSearchResponse } from '@dakly/contracts/delivery';

import { useStoreRequest } from '@/lib/store-request';

export function useAreaSearch(term: string) {
  const { contextTag, request } = useStoreRequest();
  return useQuery({
    queryKey: ['order-area-search', contextTag, term],
    queryFn: ({ signal }) =>
      request<AreaSearchResponse>(`/areas/search?${new URLSearchParams({ search: term })}`, {
        signal,
      }),
    enabled: Boolean(contextTag && term.length >= 2),
    placeholderData: keepPreviousData,
  });
}

export function useDistricts() {
  const { contextTag, request } = useStoreRequest();
  return useQuery({
    queryKey: ['order-districts', contextTag],
    queryFn: ({ signal }) => request<AreaListResponse>('/areas/districts', { signal }),
    enabled: Boolean(contextTag),
    staleTime: Infinity,
  });
}
