import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { EditOrderInput, OrderDetail } from '@dakly/contracts/orders';
import { ApiError } from '@dakly/ui/api-client';

import { orderDetailKey, prepareOrderRefresh } from './get-order';
import { useStoreRequest } from '@/lib/store-request';

export function useEditOrder() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    onMutate: ({ id }) => prepareOrderRefresh(client, contextTag, id),
    mutationFn: ({ id, body }: { id: string; body: EditOrderInput }) =>
      request<OrderDetail>(`/orders/${id}`, { method: 'PATCH', body }),
    onSuccess: (order, _input, refresh) => refresh?.(order),
    onError: (error, { id }) => {
      if (error instanceof ApiError && error.code === 'ORDER_CHANGED')
        void client.invalidateQueries({ queryKey: orderDetailKey(contextTag, id), exact: true });
    },
  });
}
