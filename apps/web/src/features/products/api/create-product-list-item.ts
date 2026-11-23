import { useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  CreateProductCategoryInput,
  ProductBrandInput,
  ProductBrandResponse,
  ProductCategoryResponse,
} from '@dakly/contracts/product-lists';

import { productsKeys } from '@/lib/product-query-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useCreateProductCategory() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductCategoryInput) =>
      request<ProductCategoryResponse>('/products/categories', { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: productsKeys.all }),
  });
}

export function useCreateProductBrand() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductBrandInput) =>
      request<ProductBrandResponse>('/products/brands', { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: productsKeys.all }),
  });
}
