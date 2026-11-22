import { useQuery } from '@tanstack/react-query';

import type { SavedReply } from '@dakly/contracts/saved-replies';

import { chatsKeys } from './chats-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useSavedReplies(enabled: boolean) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: chatsKeys.savedReplies(contextTag),
    queryFn: ({ signal }) =>
      request<{ items: SavedReply[] }>('/saved-replies?limit=100', { signal }),
    enabled: Boolean(contextTag) && enabled,
    retry: false,
  });
}
