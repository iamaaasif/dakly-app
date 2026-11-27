import { useMutation } from '@tanstack/react-query';

import type { OrderChatFill } from '@dakly/contracts/order-entry';

import { useStoreRequest } from '@/lib/store-request';

export function useFillOrderFromChat() {
  const { request } = useStoreRequest();
  return useMutation({
    mutationFn: (text: string) =>
      request<OrderChatFill>('/orders/fill-from-chat', { body: { text } }),
  });
}
