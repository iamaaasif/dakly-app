import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ProductResponse, ReorderProductPhotosInput } from '@dakly/contracts/products';

import { productPhotosPath } from './product-photos-path';
import { productsKeys } from '@/lib/product-query-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useReorderProductPhotos(
  productId: string,
  variantId?: string,
  onVersion?: (version: number) => void,
) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: (input: ReorderProductPhotosInput) =>
      request<ProductResponse>(productPhotosPath(productId, variantId), {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: (product) => {
      if (!variantId) onVersion?.(product.version);
      return client.invalidateQueries({ queryKey: productsKeys.all });
    },
  });
}
