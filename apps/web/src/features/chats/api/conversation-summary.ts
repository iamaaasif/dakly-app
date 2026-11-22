import { useQuery } from '@tanstack/react-query';

import type { ConversationSummaryResponse } from '@dakly/contracts/chats';

import { useStoreRequest } from '@/lib/store-request';

export function useConversationSummary() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: ['chats', contextTag, 'summary'],
    queryFn: ({ signal }) =>
      request<ConversationSummaryResponse>('/conversations/summary', { signal }),
    enabled: Boolean(contextTag),
    retry: false,
  });
}
