import { useQuery } from '@tanstack/react-query';

import type { PostResponse } from '@dakly/contracts/social';

import { socialKeys } from './social-keys';
import { useStoreRequest } from '@/lib/store-request';

export function usePost(postId: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: [...socialKeys.posts(contextTag), postId],
    enabled: Boolean(contextTag),
    // The editor works on a copy, so a background refetch must not replace what the person typed.
    staleTime: Infinity,
    queryFn: ({ signal }) => request<PostResponse>(`/posts/${postId}`, { signal }),
  });
}
