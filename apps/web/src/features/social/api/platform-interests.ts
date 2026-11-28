import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { PlatformInterests } from '@dakly/contracts/social';

import { socialKeys } from './social-keys';
import { useStoreRequest } from '@/lib/store-request';

export function usePlatformInterests() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: socialKeys.platformInterests(contextTag),
    enabled: Boolean(contextTag),
    queryFn: ({ signal }) => request<PlatformInterests>('/social/platform-interests', { signal }),
  });
}

export function useSetPlatformInterest(platform: PlatformInterests['platforms'][number]) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (wanted: boolean) =>
      request<PlatformInterests>(`/social/platform-interests/${platform}`, {
        method: wanted ? 'PUT' : 'DELETE',
      }),
    onSuccess: (saved) => client.setQueryData(socialKeys.platformInterests(contextTag), saved),
  });
}
