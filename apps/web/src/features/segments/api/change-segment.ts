import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ChangeSegmentInput, SegmentResponse } from '@dakly/contracts/segments';

import { segmentsKeys } from './segments-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useChangeSegment(segmentId: string) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangeSegmentInput) =>
      request<SegmentResponse>(`/segments/${segmentId}`, { method: 'PATCH', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: segmentsKeys.all }),
  });
}
