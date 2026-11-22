import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ConversationResponse, UpdateConversationInput } from '@dakly/contracts/chats';

import { useStoreRequest } from '@/lib/store-request';

// One request per chat on the existing update route; the result says how many did not change.
export function useBulkUpdateConversations() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, change }: { ids: string[]; change: UpdateConversationInput }) => {
      const results = await Promise.allSettled(
        ids.map((id) =>
          request<ConversationResponse>(`/conversations/${id}`, { method: 'PATCH', body: change }),
        ),
      );
      return { failed: results.filter((result) => result.status === 'rejected').length };
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['chats', contextTag] }),
  });
}
