import { useQuery } from '@tanstack/react-query';
import type { MemberListResponse } from '@dakly/contracts/team';
import { useStoreRequest } from '@/lib/store-request';
import { teamKeys } from './team-keys';
export function useMembers(cursor?: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: teamKeys.members(contextTag, cursor),
    queryFn: ({ signal }) =>
      request<MemberListResponse>(
        `/members?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
      ),
    enabled: Boolean(contextTag),
  });
}
