import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CodCollectedInput, OrderDetail } from '@dakly/contracts/orders';

import { refreshOrderQueries } from './orders';
import { useStoreRequest } from '@/lib/store-request';

export function useCollectOrderCod(id: string, onSaved: () => void) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CodCollectedInput) =>
      request<OrderDetail>(`/orders/${id}/cod-collected`, { body }),
    onSuccess: async () => {
      await refreshOrderQueries(client);
      onSaved();
    },
  });
}
