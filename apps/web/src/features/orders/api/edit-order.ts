import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { EditOrderInput, OrderDetail } from '@dakly/contracts/orders';

import { prepareOrderRefresh } from './get-order';
import { useStoreRequest } from '@/lib/store-request';

export function useEditOrder() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    onMutate: ({ id }) => prepareOrderRefresh(client, contextTag, id),
    mutationFn: ({ id, body }: { id: string; body: EditOrderInput }) =>
      request<OrderDetail>(`/orders/${id}`, { method: 'PATCH', body }),
    onSuccess: (order, _input, refresh) => refresh?.(order),
  });
}
