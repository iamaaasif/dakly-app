import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ApplyProductBulkEditInput,
  ProductBulkEditListResponse,
  ProductBulkEditResponse,
  ProductBulkEditUndoResponse,
} from '@dakly/contracts/product-bulk-edits';

import { productsKeys } from '@/lib/product-query-keys';
import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

export function useUndoableBulkEdits() {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: [...productsKeys.all, contextTag, 'bulk-edits'],
    queryFn: ({ signal }) =>
      request<ProductBulkEditListResponse>('/products/bulk-edits', { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canEditProducts),
  });
}

export function useApplyProductBulkEdit() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: (input: ApplyProductBulkEditInput) =>
      request<ProductBulkEditResponse>('/products/bulk-edits', { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: productsKeys.all }),
  });
}

export function useUndoProductBulkEdit() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: (id: string) =>
      request<ProductBulkEditUndoResponse>(`/products/bulk-edits/${id}/undo`, { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: productsKeys.all }),
  });
}
