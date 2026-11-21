import { useQuery } from '@tanstack/react-query';

import type { SegmentListResponse } from '@dakly/contracts/segments';

import { campaignKeys } from './campaigns-key';
import { useStoreRequest } from '@/lib/store-request';

// The audience step lists the first 50 segments, as the Segments screen does.
export function useCampaignSegments() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: campaignKeys.segments(contextTag),
    enabled: Boolean(contextTag),
    queryFn: ({ signal }) => request<SegmentListResponse>('/segments?limit=50', { signal }),
  });
}
