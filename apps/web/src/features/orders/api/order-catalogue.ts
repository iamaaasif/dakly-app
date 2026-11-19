import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

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
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (pageParam) params.set('cursor', pageParam);
      const page = await request<OrderCataloguePage>(`/orders/catalogue?${params}`, { signal });
      return { ...page, receivedAt: Date.now() };
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(contextTag && data?.currentStore?.canEditOrders),
  });
}

const catalogueProductKey = (contextTag: string | undefined, id: string) => [
  ...productsKeys.all,
  contextTag,
  'order-catalogue-product',
  id,
];

export function useRememberCatalogueProduct() {
  const { contextTag } = useStoreRequest();
  const cache = useQueryClient();
  return (product: OrderCatalogueProduct, receivedAt: number) => {
    const key = catalogueProductKey(contextTag, product.id);
    if (receivedAt > (cache.getQueryState(key)?.dataUpdatedAt ?? 0))
      cache.setQueryData(key, product, { updatedAt: receivedAt });
  };
}

export function useOrderCatalogueProducts(ids: readonly string[]) {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: catalogueProductKey(contextTag, id),
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
