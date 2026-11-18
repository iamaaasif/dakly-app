import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { OrderDetail, OrderStageChange } from '@dakly/contracts/orders';

import { ordersKey } from './orders';
import { productsKeys } from '@/lib/product-query-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useOrderStage(onSaved?: () => void) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: OrderStageChange }) =>
      request<OrderDetail>(`/orders/${id}/stage`, { method: 'POST', body }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ordersKey }),
        client.invalidateQueries({ queryKey: productsKeys.all }),
      ]);
      onSaved?.();
    },
  });
}
