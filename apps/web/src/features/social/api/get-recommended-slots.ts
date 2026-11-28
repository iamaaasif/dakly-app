import { useMutation } from '@tanstack/react-query';

import type { RecommendedPostingSlots } from '@dakly/contracts/social';

import { useStoreRequest } from '@/lib/store-request';

// Asked for only when the person presses Use recommended times, so it is a mutation and not a cached query.
export function useRecommendedSlots() {
  const { request } = useStoreRequest();
  return useMutation({
    mutationFn: () => request<RecommendedPostingSlots>('/posts/queue-slots/recommended'),
  });
}
