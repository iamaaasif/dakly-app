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
    mutationFn: async ({ id, body }: { id: string; body: OrderStageChange }) => {
      const key = orderDetailKey(contextTag, id);
      const cached = client.getQueryCache().find({ queryKey: key });
      const order = await request<OrderDetail>(`/orders/${id}/stage`, { method: 'POST', body });
      return { cached, key, order };
    },
    onSuccess: async ({ cached, key, order }) => {
      if (cached && client.getQueryCache().find({ queryKey: key }) === cached) {
        await client.cancelQueries({ queryKey: key });
        if (client.getQueryCache().find({ queryKey: key }) === cached)
          client.setQueryData(key, order);
      }
      void client.invalidateQueries({ queryKey: ordersKey });
      void client.invalidateQueries({ queryKey: productsKeys.all });
      onSaved?.();
    },
  });
}
