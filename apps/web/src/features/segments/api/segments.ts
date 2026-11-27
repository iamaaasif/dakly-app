import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { SegmentListResponse, SegmentTabCountsResponse } from '@dakly/contracts/segments';

import { segmentsPageSize, type SegmentsView } from '../segments-view';
import { segmentsKeys } from './segments-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useSegments({ status, search, cursor }: SegmentsView) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: segmentsKeys.list(contextTag, { status, search, cursor }),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ limit: String(segmentsPageSize), status });
      if (search) params.set('search', search);
      if (cursor) params.set('cursor', cursor);
      return request<SegmentListResponse>(`/segments?${params}`, { signal });
    },
    enabled: Boolean(contextTag),
    // The old rows stay while the next tab or search loads, so the table does not flash.
    placeholderData: keepPreviousData,
  });
}

export function useSegmentTabCounts() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: segmentsKeys.tabCounts(contextTag),
    queryFn: ({ signal }) => request<SegmentTabCountsResponse>('/segments/counts', { signal }),
    enabled: Boolean(contextTag),
  });
}
