import { useMutation, useQueryClient } from '@tanstack/react-query';

import { productPhotosPath } from './product-photos-path';
import { productsKeys } from '@/lib/product-query-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useRemoveProductPhoto(productId: string, variantId?: string) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: (fileId: string) =>
      request<void>(`${productPhotosPath(productId, variantId)}/${fileId}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: productsKeys.all }),
  });
}
