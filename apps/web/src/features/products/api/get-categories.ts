import { useQuery } from '@tanstack/react-query';

import type { ProductCategoriesResponse } from '@dakly/contracts/products';

import { productsKeys } from '@/lib/product-query-keys';
import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

export function useProductCategories() {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: productsKeys.categories(contextTag),
    queryFn: ({ signal }) => request<ProductCategoriesResponse>('/products/categories', { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canViewProducts),
    staleTime: 5 * 60 * 1000,
  });
}
