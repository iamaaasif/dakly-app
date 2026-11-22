import { keepPreviousData, useQuery } from '@tanstack/react-query';

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
export function useProducts(query: ProductListQuery) {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: [...productsKeys.all, contextTag, query],
    queryFn: ({ signal }) =>
      request<ProductListResponse>(`/products?${productsSearch(query)}`, { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canViewProducts),
    placeholderData: keepPreviousData,
  });
}
