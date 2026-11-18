import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import type { CreateOrderInput, OrderDetail } from '@dakly/contracts/orders';
import { ApiError } from '@dakly/ui/api-client';

import { ordersKey } from './orders';
import { productsKeys } from '@/lib/product-query-keys';
import { useStoreRequest } from '@/lib/store-request';

const rejectedOrders = new Set([
  'CONTACT_NOT_FOUND',
  'DELIVERY_AREA_INVALID',
  'DELIVERY_DEFAULT_REQUIRED',
  'ORDER_PRICE_REQUIRED',
  'ORDER_TOTAL_INVALID',
  'PRODUCT_VARIANT_NOT_FOUND',
  'STOCK_NOT_AVAILABLE',
]);

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
      if (error instanceof ApiError && rejectedOrders.has(error.code)) {
        // The order service checks the request key before it checks these business rules.
        key.current = undefined;
        setMustRetry(false);
        return;
      }
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
