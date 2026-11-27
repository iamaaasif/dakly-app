import { useQuery } from '@tanstack/react-query';

import type { ProductResponse } from '@dakly/contracts/products';
import { ApiError } from '@dakly/ui/api-client';

import { productsKeys } from '@/lib/product-query-keys';
import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

export function useGetProduct(productId: string) {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: productsKeys.detail(contextTag, productId),
    queryFn: ({ signal }) => request<ProductResponse>(`/products/${productId}`, { signal }),
    retry: (attempts, error) =>
      attempts < 3 && !(error instanceof ApiError && error.code === 'PRODUCT_NOT_FOUND'),
    enabled: Boolean(contextTag && data?.currentStore?.canViewProducts),
  });
}
