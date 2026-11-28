import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CreatePostInput, PostResponse, SchedulePostInput } from '@dakly/contracts/social';

import { socialKeys } from './social-keys';
import { useStoreRequest } from '@/lib/store-request';

type UpdateDraftInput = { postId: string; post: CreatePostInput; schedule?: SchedulePostInput };

// The draft is saved first, then scheduled; if scheduling fails the changes stay in the draft.
export function useUpdateDraft() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, post, schedule }: UpdateDraftInput) => {
      const draft = await request<PostResponse>(`/posts/${postId}`, {
        method: 'PATCH',
        body: post,
      });
      if (!schedule) return draft;
      return request<PostResponse>(`/posts/${postId}/schedule`, {
        method: 'POST',
        body: schedule,
      });
    },
    onSettled: () => client.invalidateQueries({ queryKey: socialKeys.all(contextTag) }),
  });
}
