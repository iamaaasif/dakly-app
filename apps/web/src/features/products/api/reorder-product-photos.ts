import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ProductResponse, ReorderProductPhotosInput } from '@dakly/contracts/products';

import { productsKeys } from '@/lib/product-query-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useReorderProductPhotos(productId: string) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: (input: ReorderProductPhotosInput) =>
      request<ProductResponse>(`/products/${productId}/photos`, { method: 'PATCH', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: productsKeys.all }),
  });
}
