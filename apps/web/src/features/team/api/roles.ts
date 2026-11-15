import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type { RoleListResponse } from '@dakly/contracts/team';

import { teamKeys } from './team-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useRoles(cursor?: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: teamKeys.roles(contextTag, cursor),
    queryFn: ({ signal }) =>
      request<RoleListResponse>(
        `/roles?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
      ),
    enabled: Boolean(contextTag),
  });
}

export function useRoleOptions() {
  const { request, contextTag } = useStoreRequest();
  return useInfiniteQuery({
    queryKey: [...teamKeys.roles(contextTag), 'options'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      request<RoleListResponse>(
        `/roles?limit=50${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(contextTag),
  });
}
