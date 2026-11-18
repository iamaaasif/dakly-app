import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CodCollectedInput, OrderDetail, OrderStageChange } from '@dakly/contracts/orders';

import { ordersKey } from './orders';
import { productsKeys } from '@/lib/product-queries';
import { useStoreRequest } from '@/lib/store-request';

export function useRecordOrderAction(id: string, onSaved: () => void) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: OrderStageChange | ({ to: 'cod' } & CodCollectedInput)) => {
      if (input.to === 'with_courier') {
        const { courier, courierOtherName, trackingCode } = input;
        return request<OrderDetail>(`/orders/${id}/courier`, {
          body: { courier, courierOtherName, trackingCode },
        });
      }
      if (input.to === 'cod')
        return request<OrderDetail>(`/orders/${id}/cod-collected`, {
          body: { amountPoisha: input.amountPoisha },
        });
      return request<OrderDetail>(`/orders/${id}/stage`, { body: input });
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ordersKey }),
        client.invalidateQueries({ queryKey: productsKeys.all }),
      ]);
      onSaved();
    },
  });
}
