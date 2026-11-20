import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { PostResponse } from '@dakly/contracts/social';

import { socialKeys } from './social-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useReschedulePost() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, scheduledFor }: { postId: string; scheduledFor: string }) =>
      request<PostResponse>(`/posts/${postId}/reschedule`, {
        method: 'POST',
        body: { scheduledFor },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: socialKeys.posts(contextTag) }),
  });
}
