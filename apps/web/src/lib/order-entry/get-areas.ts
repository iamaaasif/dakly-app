import { useQuery } from '@tanstack/react-query';

import type { AreaListResponse } from '@dakly/contracts/delivery';

import { useStoreRequest } from '@/lib/store-request';

export function useOrderAreas(parentId?: number) {
  const { contextTag, request } = useStoreRequest();
  return useQuery({
    queryKey: ['order-areas', contextTag, parentId],
    queryFn: ({ signal }) =>
      request<AreaListResponse>(`/areas?limit=100${parentId ? `&parentId=${parentId}` : ''}`, {
        signal,
      }),
    enabled: Boolean(contextTag && parentId !== 0),
  });
}
