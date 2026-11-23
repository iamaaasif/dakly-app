import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ChangeProductCategoryInput, ProductBrandInput } from '@dakly/contracts/product-lists';

import { productsKeys } from '@/lib/product-query-keys';
import { useStoreRequest } from '@/lib/store-request';

type ListKind = 'categories' | 'brands';

export function useChangeProductListItem(kind: ListKind) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: { id: string } & (ChangeProductCategoryInput | ProductBrandInput)) =>
      request(`/products/${kind}/${id}`, { method: 'PATCH', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: productsKeys.all }),
  });
}

export function useDeleteProductListItem(kind: ListKind) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request(`/products/${kind}/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: productsKeys.all }),
  });
}
