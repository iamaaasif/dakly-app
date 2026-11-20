import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { PostingSlotsResponse, SavePostingSlotsInput } from '@dakly/contracts/social';

import { socialKeys } from './social-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useSavePostingSlots() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SavePostingSlotsInput) =>
      request<PostingSlotsResponse>('/posts/queue-slots', { method: 'PUT', body: input }),
    onSuccess: (saved) =>
      client.setQueryData(socialKeys.slots(contextTag, saved.channelConnectionId), saved),
  });
}
