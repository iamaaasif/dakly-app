import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ChangeProductInput, ProductResponse } from '@dakly/contracts/products';

import { productsKeys } from '@/lib/product-query-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useChangeProduct(
  productId: string,
  onChanged?: (product: ProductResponse) => void,
) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: (input: ChangeProductInput) =>
      request<ProductResponse>(`/products/${productId}`, { method: 'PATCH', body: input }),
    onSuccess: (product) => {
      onChanged?.(product);
      return client.invalidateQueries({ queryKey: productsKeys.all });
    },
  });
}
