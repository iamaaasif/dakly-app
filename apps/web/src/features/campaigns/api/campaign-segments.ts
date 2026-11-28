import { useQuery } from '@tanstack/react-query';

import type { SegmentListResponse } from '@dakly/contracts/segments';

import { campaignKeys } from './campaigns-key';
import { useStoreRequest } from '@/lib/store-request';

// The audience step lists the first 50 segments, as the Segments screen does, plus the one-off
// audiences the draft already has, which the list otherwise leaves out.
export function useCampaignSegments(chosenIds: string[]) {
  const { request, contextTag } = useStoreRequest();
  const include = chosenIds.join(',');
  return useQuery({
    queryKey: [...campaignKeys.segments(contextTag), include],
    enabled: Boolean(contextTag),
    queryFn: ({ signal }) =>
      request<SegmentListResponse>(`/segments?limit=50${include ? `&include=${include}` : ''}`, {
        signal,
      }),
  });
}
