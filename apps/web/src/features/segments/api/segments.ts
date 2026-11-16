import { useQuery } from '@tanstack/react-query';

import type { SegmentListResponse } from '@dakly/contracts/segments';

import { segmentsKeys } from './segments-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useSegments(cursor?: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: segmentsKeys.list(contextTag, cursor),
    queryFn: ({ signal }) =>
      request<SegmentListResponse>(
        `/segments?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
      ),
    enabled: Boolean(contextTag),
  });
}
