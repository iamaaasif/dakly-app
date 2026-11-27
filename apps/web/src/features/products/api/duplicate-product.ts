import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ProductResponse } from '@dakly/contracts/products';

import { productsKeys } from '@/lib/product-query-keys';
import { useStoreRequest } from '@/lib/store-request';

// The copy is a draft with no stock, so the person edits it before it shows to customers.
export function useDuplicateProduct(productId: string) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: () =>
      request<ProductResponse>(`/products/${productId}/duplicate`, { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: productsKeys.all }),
  });
}
