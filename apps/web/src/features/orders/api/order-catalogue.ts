import {
  useInfiniteQuery,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryFunctionContext,
} from '@tanstack/react-query';
import { useEffect } from 'react';

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
      const requestedAt = performance.now();
      const page = await request<OrderCataloguePage>(`/orders/catalogue?${params}`, { signal });
      return { ...page, requestedAt };
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

type ProductSnapshot = OrderCatalogueProduct & { requestedAt: number };

export function useSelectedCatalogueProduct(
  id: string,
  product: OrderCatalogueProduct | undefined,
  requestedAt = 0,
) {
  const { contextTag } = useStoreRequest();
  const cache = useQueryClient();
  const [selected] = useOrderCatalogueProducts(id ? [id] : []);
  useEffect(() => {
    if (!product) return;
    const key = catalogueProductKey(contextTag, product.id);
    if (requestedAt > (cache.getQueryData<ProductSnapshot>(key)?.requestedAt ?? -1))
      cache.setQueryData(key, { ...product, requestedAt });
  }, [cache, contextTag, product, requestedAt]);
  const latest = selected?.data;
  return (latest?.requestedAt ?? -1) > requestedAt ? latest : (product ?? latest);
}

export function useOrderCatalogueProducts(ids: readonly string[]) {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: catalogueProductKey(contextTag, id),
      queryFn: async ({ client, queryKey, signal }: QueryFunctionContext) => {
        const requestedAt = performance.now();
        const product = await request<OrderCatalogueProduct>(`/orders/catalogue/${id}`, { signal });
        const latest = client.getQueryData<ProductSnapshot>(queryKey);
        return latest && latest.requestedAt > requestedAt ? latest : { ...product, requestedAt };
      },
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
