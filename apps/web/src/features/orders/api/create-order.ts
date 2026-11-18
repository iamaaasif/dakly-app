import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import type { CreateOrderInput, OrderDetail } from '@dakly/contracts/orders';

import { ordersKey } from './orders';
import { productsKeys } from '@/lib/product-queries';
import { useStoreRequest } from '@/lib/store-request';

export function useCreateOrder() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  const key = useRef<string | undefined>(undefined);
  return useMutation({
    mutationFn: (body: CreateOrderInput) => {
      key.current ??= crypto.randomUUID();
      return request<OrderDetail>('/orders', { body, idempotencyKey: key.current });
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ordersKey }),
        client.invalidateQueries({ queryKey: productsKeys.all }),
      ]);
    },
  });
}
