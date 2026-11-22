import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import type { ConversationMessageResponse, ConversationResponse } from '@dakly/contracts/chats';
import { ApiError } from '@dakly/ui/api-client';

import { chatsKeys } from './chats-keys';
import { useStoreRequest } from '@/lib/store-request';

type MessagePage = { items: ConversationMessageResponse[]; nextCursor: string | null };

export function useConversation(id: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: chatsKeys.conversation(contextTag, id),
    queryFn: ({ signal }) => request<ConversationResponse>(`/conversations/${id}`, { signal }),
    enabled: Boolean(contextTag),
    retry: false,
  });
}

export function useConversationMessages(id: string) {
  const { request, contextTag } = useStoreRequest();
  return useInfiniteQuery({
    queryKey: chatsKeys.messages(contextTag, id),
    queryFn: ({ signal, pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (pageParam) params.set('cursor', pageParam);
      return request<MessagePage>(`/conversations/${id}/messages?${params}`, { signal });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(contextTag),
    retry: false,
  });
}

// Opening a chat reads it, so the unread number on its row clears.
export function useMarkConversationRead() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<ConversationResponse>(`/conversations/${id}/read`, { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['chats', contextTag, 'list'] }),
  });
}

export function useSendReply(id: string) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  // One key per attempt: a retry after a lost answer reuses it, so the customer gets one message.
  const key = useRef<string | undefined>(undefined);
  return useMutation({
    mutationFn: (body: string) => {
      key.current ??= crypto.randomUUID();
      return request<{ messageId: string }>(`/conversations/${id}/replies`, {
        method: 'POST',
        body: { body, operationKey: key.current },
      });
    },
    onSuccess: () => {
      key.current = undefined;
      return client.invalidateQueries({ queryKey: chatsKeys.messages(contextTag, id) });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status !== undefined && error.status < 500)
        key.current = undefined;
    },
  });
}

export function useAddNote(id: string) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      request<ConversationMessageResponse>(`/conversations/${id}/notes`, {
        method: 'POST',
        body: { body },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: chatsKeys.messages(contextTag, id) }),
  });
}
