import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { StockAdjustmentInput } from '@dakly/contracts/products';

import { productsKeys } from '@/lib/product-query-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useAdjustStock() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: ({ variantId, input }: { variantId: string; input: StockAdjustmentInput }) =>
      request<void>(`/variants/${variantId}/stock-adjustments`, { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: productsKeys.all }),
  });
}
