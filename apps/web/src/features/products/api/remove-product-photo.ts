import { useMutation, useQueryClient } from '@tanstack/react-query';

import { productsKeys } from '@/lib/product-query-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useRemoveProductPhoto(productId: string) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: (fileId: string) =>
      request<void>(`/products/${productId}/photos/${fileId}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: productsKeys.all }),
  });
}
