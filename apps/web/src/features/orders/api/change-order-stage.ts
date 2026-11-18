import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { OrderDetail, OrderStageChange } from '@dakly/contracts/orders';

import { orderDetailKey } from './get-order';
import { ordersKey } from './orders';
import { productsKeys } from '@/lib/product-query-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useOrderStage(onSaved?: () => void) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    onMutate: ({ id }) =>
      client.getQueryCache().find<OrderDetail>({
        queryKey: orderDetailKey(contextTag, id),
        exact: true,
      }),
    mutationFn: ({ id, body }: { id: string; body: OrderStageChange }) =>
      request<OrderDetail>(`/orders/${id}/stage`, { method: 'POST', body }),
    onSuccess: async (order, _input, original) => {
      await original?.cancel({ revert: true });
      // A shop switch can remove the detail query while the order update is in flight.
      const cache = client.getQueryCache();
      const saved = original && cache.get(original.queryHash) === original ? original : undefined;
      saved?.setData(order, { manual: true });
      void client.invalidateQueries({ queryKey: ordersKey, predicate: (query) => query !== saved });
      void client.invalidateQueries({ queryKey: productsKeys.all });
      onSaved?.();
    },
  });
}
