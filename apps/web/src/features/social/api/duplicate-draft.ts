import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CreatePostInput, PostResponse } from '@dakly/contracts/social';

import { socialKeys } from './social-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useDuplicateDraft() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draft: PostResponse) => {
      const copy: CreatePostInput = {
        kind: draft.kind,
        caption: draft.caption,
        mediaFileIds: draft.mediaFileIds,
        linkUrl: draft.linkUrl,
        firstComment: draft.firstComment,
        isAiWritten: draft.isAiWritten,
        targets: draft.targets.map(({ channelConnectionId, captionOverride }) => ({
          channelConnectionId,
          captionOverride,
        })),
      };
      return request<PostResponse>('/posts', {
        method: 'POST',
        body: copy,
        idempotencyKey: crypto.randomUUID(),
      });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: socialKeys.drafts(contextTag) }),
  });
}
