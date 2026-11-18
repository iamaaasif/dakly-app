import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { OrderDetail, OrderStageChange } from '@dakly/contracts/orders';

import { ordersKey } from './orders';
import { useStoreRequest } from '@/lib/store-request';

export function useOrderStage(id: string) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: OrderStageChange) =>
      request<OrderDetail>(`/orders/${id}/stage`, { method: 'POST', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ordersKey }),
  });
}
