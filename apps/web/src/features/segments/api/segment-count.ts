import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { SegmentCountResponse, SegmentRules } from '@dakly/contracts/segments';

import { segmentsKeys } from './segments-keys';
import { useStoreRequest } from '@/lib/store-request';

// Counts are live (feature 03), so an unfinished tree is simply not counted.
export function useSegmentCount(rules: SegmentRules | undefined) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: segmentsKeys.count(contextTag, rules),
    queryFn: ({ signal }) =>
      request<SegmentCountResponse>('/segments/preview', {
        method: 'POST',
        body: { rules },
        signal,
      }),
    enabled: Boolean(contextTag && rules),
    placeholderData: keepPreviousData,
  });
}
