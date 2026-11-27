import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useRef } from 'react';

import type { ConversationMessageResponse, ConversationResponse } from '@dakly/contracts/chats';
import type { ConfirmProductPhotoInput } from '@dakly/contracts/products';
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

// The reply shows in the thread the moment it is sent, as a queued message the thread read replaces.
export type ReplyDraft = { body: string; photo?: ConfirmProductPhotoInput };

export function useSendReply(id: string) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  const messagesKey = chatsKeys.messages(contextTag, id);
  // One key per attempt: a retry after a lost answer reuses it, so the customer gets one message.
  const attempt = useRef<{ draft: string; key: string } | undefined>(undefined);
  return useMutation({
    mutationFn: (reply: ReplyDraft) => {
      const draft = JSON.stringify(reply);
      if (attempt.current?.draft !== draft) attempt.current = { draft, key: crypto.randomUUID() };
      return request<{ messageId: string }>(`/conversations/${id}/replies`, {
        method: 'POST',
        body: { ...reply, operationKey: attempt.current.key },
      });
    },
    onMutate: async ({ body, photo }) => {
      await client.cancelQueries({ queryKey: messagesKey });
      const before = client.getQueryData<InfiniteData<MessagePage>>(messagesKey);
      const now = new Date().toISOString();
      const pending: ConversationMessageResponse = {
        id: `pending-${attempt.current?.key ?? crypto.randomUUID()}`,
        kind: photo && !body ? 'image' : 'text',
        direction: 'out',
        body,
        authorType: 'user',
        authorUserId: null,
        status: 'queued',
        sourceType: 'chat',
        createdAt: now,
        sentAt: null,
      };
      // The list is newest first, so the new message goes at the front of the first page.
      if (before?.pages[0])
        client.setQueryData<InfiniteData<MessagePage>>(messagesKey, {
          ...before,
          pages: [
            { ...before.pages[0], items: [pending, ...before.pages[0].items] },
            ...before.pages.slice(1),
          ],
        });
      return { before };
    },
    onSuccess: () => {
      attempt.current = undefined;
    },
    onError: (error, _body, context) => {
      if (context?.before) client.setQueryData(messagesKey, context.before);
      if (error instanceof ApiError && error.status !== undefined && error.status < 500)
        attempt.current = undefined;
    },
    onSettled: () => client.invalidateQueries({ queryKey: messagesKey }),
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
