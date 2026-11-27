import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import type { WriteConversationReplyInput, WrittenConversationReply } from '@dakly/contracts/chats';
import type { OrderLinkUrlResponse } from '@dakly/contracts/orders';
import type { ProductListResponse } from '@dakly/contracts/products';
import { ApiError } from '@dakly/ui/api-client';

import { chatsKeys } from './chats-keys';
import { useStoreRequest } from '@/lib/store-request';

// Staff pick from the shop's products; a search of 3 letters or more narrows the list.
export function useProductSearch(term: string) {
  const { request, contextTag } = useStoreRequest();
  const query = new URLSearchParams({ limit: '20' });
  if (term.length >= 3) query.set('search', term);
  return useQuery({
    queryKey: chatsKeys.products(contextTag, term),
    enabled: Boolean(contextTag),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => request<ProductListResponse>(`/products?${query}`, { signal }),
  });
}

export function useSendProduct(id: string) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  // One key per press: a retry after a lost answer reuses it, so the customer gets one card.
  const attempt = useRef<{ productId: string; key: string } | undefined>(undefined);
  return useMutation({
    mutationFn: (productId: string) => {
      if (attempt.current?.productId !== productId)
        attempt.current = { productId, key: crypto.randomUUID() };
      return request<{ messageId: string }>(`/conversations/${id}/products`, {
        method: 'POST',
        body: { productId, operationKey: attempt.current.key },
      });
    },
    onSuccess: () => {
      attempt.current = undefined;
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status !== undefined && error.status < 500)
        attempt.current = undefined;
    },
    onSettled: () => client.invalidateQueries({ queryKey: chatsKeys.messages(contextTag, id) }),
  });
}

export function useOrderLink() {
  const { request } = useStoreRequest();
  return useMutation({
    mutationFn: (productId: string) =>
      request<OrderLinkUrlResponse>(`/order-links/${productId}`).then(({ url }) => url),
  });
}

export function useReplyDraft(id: string) {
  const { request } = useStoreRequest();
  return useMutation({
    mutationFn: (input: WriteConversationReplyInput) =>
      request<WrittenConversationReply>(`/conversations/${id}/reply-drafts`, {
        method: 'POST',
        body: input,
      }).then(({ text }) => text),
  });
}
