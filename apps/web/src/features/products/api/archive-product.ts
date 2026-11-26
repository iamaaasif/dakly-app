import { useMutation, useQueryClient } from '@tanstack/react-query';

import { productsKeys } from '@/lib/product-query-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useArchiveProduct(productId: string, onArchived?: () => void) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: () => request<void>(`/products/${productId}`, { method: 'DELETE' }),
    onSuccess: () => {
      onArchived?.();
      void client.invalidateQueries({ queryKey: productsKeys.all });
    },
  });
}
