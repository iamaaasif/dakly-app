import { useMutation, useQueryClient } from '@tanstack/react-query';

import { socialKeys } from './social-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useDeleteDraft() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => request<void>(`/posts/${postId}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: socialKeys.drafts(contextTag) }),
  });
}
