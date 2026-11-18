import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import type { CreateOrderInput, OrderDetail } from '@dakly/contracts/orders';
import { ApiError } from '@dakly/ui/api-client';

import { ordersKey } from './orders';
import { productsKeys } from '@/lib/product-query-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useCreateOrder() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  const key = useRef<string | undefined>(undefined);
  const [mustRetry, setMustRetry] = useState(false);
  const create = useMutation({
    mutationFn: (body: CreateOrderInput) => {
      key.current ??= crypto.randomUUID();
      return request<OrderDetail>('/orders', { body, idempotencyKey: key.current });
    },
    onError: (error) => {
      const reply = error instanceof ApiError ? error : undefined;
      const status = reply?.status;
      const unanswered =
        status === undefined ||
        status === 408 ||
        status === 429 ||
        status >= 500 ||
        reply?.code === 'REQUEST_FAILED';
      if (!unanswered) key.current = undefined;
      setMustRetry(unanswered);
    },
    onSuccess: () => {
      setMustRetry(false);
      void client.invalidateQueries({ queryKey: ordersKey });
      void client.invalidateQueries({ queryKey: productsKeys.all });
    },
  });
  return { ...create, mustRetry };
}
