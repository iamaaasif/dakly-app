import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ProductResponse } from '@dakly/contracts/products';

import { productPhotosPath } from './product-photos-path';
import { productsKeys } from '@/lib/product-query-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useRemoveProductPhoto(
  productId: string,
  variantId?: string,
  onVersion?: (version: number) => void,
) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: (fileId: string) =>
      request<void>(`${productPhotosPath(productId, variantId)}/${fileId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: productsKeys.all });
      if (variantId || !onVersion) return;
      const updated = client.getQueryData<ProductResponse>(
        productsKeys.detail(contextTag, productId),
      );
      if (updated) onVersion(updated.version);
    },
  });
}
