import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type {
  ConversationAssigneeResponse,
  ConversationCountsResponse,
  ConversationListQuery,
  ConversationResponse,
} from '@dakly/contracts/chats';

import { chatsKeys } from './chats-keys';
import { useStoreRequest } from '@/lib/store-request';

type ConversationPage = { items: ConversationResponse[]; nextCursor: string | null };

export function useConversations(filters: Partial<ConversationListQuery>) {
  const { request, contextTag } = useStoreRequest();
  return useInfiniteQuery({
    queryKey: chatsKeys.list(contextTag, filters),
    queryFn: ({ signal, pageParam }) => {
      const params = new URLSearchParams({ limit: '30' });
      for (const [name, value] of Object.entries({ ...filters, cursor: pageParam }))
        if (value !== undefined) params.set(name, String(value));
      return request<ConversationPage>(`/conversations?${params}`, { signal });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(contextTag),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useConversationCounts() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: chatsKeys.counts(contextTag),
    queryFn: ({ signal }) =>
      request<ConversationCountsResponse>('/conversations/counts', { signal }),
    enabled: Boolean(contextTag),
    retry: false,
  });
}

export function useConversationAssignees() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: chatsKeys.assignees(contextTag),
    queryFn: ({ signal }) =>
      request<ConversationAssigneeResponse[]>('/conversations/assignees', { signal }),
    enabled: Boolean(contextTag),
    staleTime: 60_000,
    retry: false,
  });
}
