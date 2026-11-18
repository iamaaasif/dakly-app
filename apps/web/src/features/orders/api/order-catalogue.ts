import { useInfiniteQuery, useQueries } from '@tanstack/react-query';

import type { OrderCataloguePage, OrderCatalogueProduct } from '@dakly/contracts/orders';

import { productsKeys } from '@/lib/product-query-keys';
import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

export function useOrderCatalogue(search?: string) {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useInfiniteQuery({
    queryKey: [...productsKeys.all, contextTag, 'order-catalogue', search],
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (pageParam) params.set('cursor', pageParam);
      return request<OrderCataloguePage>(`/orders/catalogue?${params}`, { signal });
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(contextTag && data?.currentStore?.canEditOrders),
  });
}

export function useOrderCatalogueProducts(ids: readonly string[]) {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: [...productsKeys.all, contextTag, 'order-catalogue-product', id],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        request<OrderCatalogueProduct>(`/orders/catalogue/${id}`, { signal }),
      enabled: Boolean(contextTag && data?.currentStore?.canEditOrders),
    })),
  });
}
