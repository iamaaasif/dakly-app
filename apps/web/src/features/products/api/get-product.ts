import { useQuery } from '@tanstack/react-query';

import type { ProductResponse } from '@dakly/contracts/products';

import { productsKeys } from '@/lib/product-queries';
import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

export function useGetProduct(productId: string) {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: productsKeys.detail(contextTag, productId),
    queryFn: ({ signal }) => request<ProductResponse>(`/products/${productId}`, { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canViewProducts),
  });
}
