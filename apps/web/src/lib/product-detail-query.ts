import { useQueries, useQuery } from '@tanstack/react-query';

import type { ProductResponse } from '@dakly/contracts/products';

import { productsKeys } from '@/lib/product-query-keys';
import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

function productQuery(
  { request, contextTag }: ReturnType<typeof useStoreRequest>,
  productId: string,
  enabled: boolean,
) {
  return {
    queryKey: productsKeys.detail(contextTag, productId),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      request<ProductResponse>(`/products/${productId}`, { signal }),
    enabled,
  };
}

export function useGetProduct(productId: string) {
  const scope = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery(
    productQuery(
      scope,
      productId,
      Boolean(scope.contextTag && data?.currentStore?.canViewProducts),
    ),
  );
}

export function useProductDetails(productIds: readonly string[]) {
  const scope = useStoreRequest();
  const { data } = useSessionContext();
  const enabled = Boolean(scope.contextTag && data?.currentStore?.canViewProducts);
  return useQueries({
    queries: productIds.map((id) => productQuery(scope, id, enabled)),
  });
}
