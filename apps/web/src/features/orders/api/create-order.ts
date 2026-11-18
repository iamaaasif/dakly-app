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
      if (
        !(error instanceof ApiError) ||
        error.status === undefined ||
        error.status === 408 ||
        error.status >= 500
      )
        setMustRetry(true);
    },
    onSuccess: () => {
      setMustRetry(false);
      void client.invalidateQueries({ queryKey: ordersKey });
      void client.invalidateQueries({ queryKey: productsKeys.all });
    },
  });
  return { ...create, mustRetry };
}
