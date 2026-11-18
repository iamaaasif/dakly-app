import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { OrderDetail, OrderStageChange } from '@dakly/contracts/orders';

import { prepareOrderRefresh } from './get-order';
import { useStoreRequest } from '@/lib/store-request';

export function useOrderStage(onSaved?: () => void) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    onMutate: ({ id }) => prepareOrderRefresh(client, contextTag, id),
    mutationFn: ({ id, body }: { id: string; body: OrderStageChange }) =>
      request<OrderDetail>(`/orders/${id}/stage`, { method: 'POST', body }),
    onSuccess: async (order, _input, refresh) => {
      await refresh?.(order);
      onSaved?.();
    },
  });
}
