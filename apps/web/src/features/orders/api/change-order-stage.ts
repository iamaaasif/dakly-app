import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { OrderDetail, OrderStageChange } from '@dakly/contracts/orders';

import { refreshOrderQueries } from './orders';
import { useStoreRequest } from '@/lib/store-request';

export function useOrderStage(onSaved?: () => void) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: OrderStageChange }) =>
      request<OrderDetail>(`/orders/${id}/stage`, { method: 'POST', body }),
    onSuccess: async (_, { body }) => {
      await refreshOrderQueries(
        client,
        ['cancelled', 'partially_delivered', 'returned'].includes(body.to),
      );
      onSaved?.();
    },
  });
}
