import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { DispatchOrderInput, OrderDetail } from '@dakly/contracts/orders';

import { prepareOrderRefresh } from './get-order';
import { useStoreRequest } from '@/lib/store-request';

export function useDispatchOrder(id: string, onSaved: () => void) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    onMutate: () => prepareOrderRefresh(client, contextTag, id),
    mutationFn: (body: DispatchOrderInput) =>
      request<OrderDetail>(`/orders/${id}/courier`, { body }),
    onSuccess: async (order, _input, refresh) => {
      await refresh?.(order);
      onSaved();
    },
  });
}
