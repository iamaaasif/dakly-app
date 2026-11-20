import { useQuery } from '@tanstack/react-query';

import type { PostListResponse } from '@dakly/contracts/social';

import { socialKeys } from './social-keys';
import { useStoreRequest } from '@/lib/store-request';

// Drafts that the signed-in person created and has not scheduled.
export function useDrafts() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: socialKeys.drafts(contextTag),
    enabled: Boolean(contextTag),
    queryFn: ({ signal }) =>
      request<PostListResponse>('/posts?drafts=mine&limit=100', { signal }).then(
        (page) => page.items,
      ),
  });
}
