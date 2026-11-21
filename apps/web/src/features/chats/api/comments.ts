import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import type { CommentReplyInput, CommentResponse } from '@dakly/contracts/comments';

import { chatsKeys } from './chats-keys';
import { useStoreRequest } from '@/lib/store-request';

type CommentPage = { items: CommentResponse[]; nextCursor: string | null };

export function useComments() {
  const { request, contextTag } = useStoreRequest();
  return useInfiniteQuery({
    queryKey: chatsKeys.comments(contextTag),
    queryFn: ({ signal, pageParam }) => {
      const params = new URLSearchParams({ limit: '100' });
      if (pageParam) params.set('cursor', pageParam);
      return request<CommentPage>(`/comments?${params}`, { signal });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(contextTag),
    retry: false,
  });
}

function useCommentAction<Input>(
  action: (input: Input) => string,
  body: (input: Input) => unknown,
) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { commentId: string } & Input) =>
      request<CommentResponse>(`/comments/${input.commentId}/${action(input)}`, {
        method: 'POST',
        body: body(input),
      }),
    // Also after a failure: Meta may have accepted the action before the answer was lost.
    onSettled: () => client.invalidateQueries({ queryKey: chatsKeys.comments(contextTag) }),
  });
}

export function useReplyPublicly() {
  return useCommentAction<CommentReplyInput>(
    () => 'reply',
    ({ body }) => ({ body }),
  );
}

export function useReplyPrivately() {
  return useCommentAction<CommentReplyInput>(
    () => 'private-reply',
    ({ body }) => ({ body }),
  );
}

export function useSetCommentHidden() {
  return useCommentAction<{ hidden: boolean }>(
    ({ hidden }) => (hidden ? 'hide' : 'unhide'),
    () => ({}),
  );
}
