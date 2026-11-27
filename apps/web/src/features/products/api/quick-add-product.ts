import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CreateProductInput, ProductResponse } from '@dakly/contracts/products';

import { productPhotosPath } from './product-photos-path';
import { uploadProductPhotoFile } from './upload-product-photo';
import { productsKeys } from '@/lib/product-query-keys';
import { useStoreRequest } from '@/lib/store-request';

type QuickAddInput = {
  product: Omit<CreateProductInput, 'imageFileIds'>;
  stock: number;
  photo: File | null;
};
export type QuickAddResult = { product: ProductResponse; failed: ('stock' | 'photo')[] };

// The product is saved first; stock and photo need its ids, and a failure in either keeps the product.
export function useQuickAddProduct() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: async ({ product, stock, photo }: QuickAddInput): Promise<QuickAddResult> => {
      const saved = await request<ProductResponse>('/products', { method: 'POST', body: product });
      const failed: QuickAddResult['failed'] = [];
      const variantId = saved.variants[0]?.id;
      if (stock > 0 && variantId) {
        await request(`/variants/${variantId}/stock-adjustments`, {
          method: 'POST',
          body: { quantity: stock, reason: 'Initial stock' },
        }).catch(() => failed.push('stock'));
      }
      if (photo) {
        await uploadProductPhotoFile(request, productPhotosPath(saved.id), photo).catch(() =>
          failed.push('photo'),
        );
      }
      return { product: saved, failed };
    },
    onSettled: () => client.invalidateQueries({ queryKey: productsKeys.all }),
  });
}
