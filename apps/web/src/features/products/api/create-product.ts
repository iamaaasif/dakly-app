import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CreateProductInput, ProductResponse } from '@dakly/contracts/products';

import { productsKeys } from '@/lib/product-queries';
import { useStoreRequest } from '@/lib/store-request';

export function useCreateProduct() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: (input: CreateProductInput) =>
      request<ProductResponse>('/products', { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: productsKeys.all }),
  });
}
