import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { DispatchOrderInput, OrderDetail } from '@dakly/contracts/orders';

import { refreshOrderQueries } from './orders';
import { useStoreRequest } from '@/lib/store-request';

export function useDispatchOrder(id: string, onSaved: () => void) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: DispatchOrderInput) =>
      request<OrderDetail>(`/orders/${id}/courier`, { body }),
    onSuccess: async () => {
      await refreshOrderQueries(client, true);
      onSaved();
    },
  });
}
