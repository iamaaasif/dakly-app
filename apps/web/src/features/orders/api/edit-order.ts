import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { EditOrderInput, OrderDetail } from '@dakly/contracts/orders';

import { ordersKey } from './orders';
import { productsKeys } from '@/lib/product-queries';
import { useStoreRequest } from '@/lib/store-request';

export function useEditOrder() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: EditOrderInput }) =>
      request<OrderDetail>(`/orders/${id}`, { method: 'PATCH', body }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ordersKey }),
        client.invalidateQueries({ queryKey: productsKeys.all }),
      ]);
    },
  });
}
