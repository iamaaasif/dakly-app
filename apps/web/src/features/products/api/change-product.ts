import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ChangeProductInput, ProductResponse } from '@dakly/contracts/products';

import { productsKeys } from './products';
import { useStoreRequest } from '@/lib/store-request';

export function useChangeProduct(productId: string) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: (input: ChangeProductInput) =>
      request<ProductResponse>(`/products/${productId}`, { method: 'PATCH', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: productsKeys.all }),
  });
}
