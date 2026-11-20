import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CreatePostInput, PostResponse, SchedulePostInput } from '@dakly/contracts/social';

import { socialKeys } from './social-keys';
import { useStoreRequest } from '@/lib/store-request';

type SavePostInput = { post: CreatePostInput; schedule?: SchedulePostInput };

// A draft is saved first, then scheduled; if scheduling fails the draft stays in My drafts.
export function useSavePost() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ post, schedule }: SavePostInput) => {
      const draft = await request<PostResponse>('/posts', {
        method: 'POST',
        body: post,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!schedule) return draft;
      return request<PostResponse>(`/posts/${draft.id}/schedule`, {
        method: 'POST',
        body: schedule,
      });
    },
    onSettled: () => client.invalidateQueries({ queryKey: socialKeys.all(contextTag) }),
  });
}
