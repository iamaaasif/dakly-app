import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ConversationResponse, UpdateConversationInput } from '@dakly/contracts/chats';

import { useStoreRequest } from '@/lib/store-request';

export type BulkChange = { change: UpdateConversationInput } | { label: string };

// One request per chat on the existing update and label routes; the result says how many did not
// change.
export function useBulkUpdateConversations() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, ...action }: { ids: string[] } & BulkChange) => {
      const results = await Promise.allSettled(
        ids.map((id) =>
          'label' in action
            ? request<ConversationResponse>(`/conversations/${id}/labels`, {
                method: 'POST',
                body: { label: action.label, change: 'add' },
              })
            : request<ConversationResponse>(`/conversations/${id}`, {
                method: 'PATCH',
                body: action.change,
              }),
        ),
      );
      return { failed: results.filter((result) => result.status === 'rejected').length };
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['chats', contextTag] }),
  });
}
