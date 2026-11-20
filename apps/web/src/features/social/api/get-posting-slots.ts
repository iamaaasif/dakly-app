import { useQuery } from '@tanstack/react-query';

import type { PostingSlotsResponse } from '@dakly/contracts/social';

import { socialKeys } from './social-keys';
import { useStoreRequest } from '@/lib/store-request';

export function usePostingSlots(channelConnectionId: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: socialKeys.slots(contextTag, channelConnectionId),
    enabled: Boolean(contextTag),
    queryFn: ({ signal }) =>
      request<PostingSlotsResponse>(
        `/posts/queue-slots?channelConnectionId=${channelConnectionId}`,
        {
          signal,
        },
      ),
  });
}
