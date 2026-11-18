import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type { ProductListQuery, ProductListResponse } from '@dakly/contracts/products';

import { productsKeys } from '@/lib/product-query-keys';
import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

export function productsSearch(query: Partial<ProductListQuery>) {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) parameters.set(key, String(value));
  return parameters.toString();
}
function productsPage(
  request: ReturnType<typeof useStoreRequest>['request'],
  query: ProductListQuery,
  signal: AbortSignal,
) {
  return request<ProductListResponse>(`/products?${productsSearch(query)}`, { signal });
}

export function useProducts(query: ProductListQuery) {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: [...productsKeys.all, contextTag, query],
    queryFn: ({ signal }) => productsPage(request, query, signal),
    enabled: Boolean(contextTag && data?.currentStore?.canViewProducts),
  });
}

export function useProductPages(search?: string) {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useInfiniteQuery({
    queryKey: [...productsKeys.all, contextTag, 'pages', search],
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) =>
      productsPage(request, { search, limit: 50, cursor: pageParam || undefined }, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(contextTag && data?.currentStore?.canViewProducts),
  });
}
