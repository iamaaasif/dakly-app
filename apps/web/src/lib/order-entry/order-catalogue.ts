import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';

import type {
  OrderCataloguePage,
  OrderCatalogueProduct,
  OrderCatalogueStock,
} from '@dakly/contracts/orders';

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

export function useOrderCatalogueStock(ids: string[]) {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  const variantIds = [...new Set(ids)].sort();
  const args = new URLSearchParams({ variantIds: variantIds.join(',') });
  return useQuery({
    queryKey: [...productsKeys.all, contextTag, 'order-catalogue-stock', variantIds],
    queryFn: ({ signal }) =>
      request<OrderCatalogueStock>(`/orders/catalogue/stock?${args}`, { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canEditOrders && variantIds.length),
  });
}
