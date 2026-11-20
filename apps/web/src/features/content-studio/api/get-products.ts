import { useQuery } from '@tanstack/react-query';

import type { ProductListResponse } from '@dakly/contracts/products';

import { contentKeys } from './content-keys';
import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

// The first page holds enough products to choose from.
export function useProductChoices() {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: contentKeys.products(contextTag),
    enabled: Boolean(contextTag && data?.currentStore?.canViewProducts),
    queryFn: async ({ signal }) => {
      const page = await request<ProductListResponse>('/products?limit=50', { signal });
      return page.items.map(({ id, name }) => ({ id, name }));
    },
  });
}
