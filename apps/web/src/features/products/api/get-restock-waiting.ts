import { useQuery } from '@tanstack/react-query';

import type { RestockWaitingResponse } from '@dakly/contracts/restock-requests';

import { productsKeys } from '@/lib/product-query-keys';
import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

export function useRestockWaiting(productId: string) {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: productsKeys.restockWaiting(contextTag, productId),
    queryFn: ({ signal }) =>
      request<RestockWaitingResponse>(`/products/${productId}/restock-waiting`, { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canViewProducts),
  });
}
