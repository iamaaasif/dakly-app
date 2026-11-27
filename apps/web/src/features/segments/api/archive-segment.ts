import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { SegmentResponse } from '@dakly/contracts/segments';

import { segmentsKeys } from './segments-keys';
import { useStoreRequest } from '@/lib/store-request';

export type ArchiveSegmentInput = { segmentId: string; archived: boolean };

export function useArchiveSegment() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ segmentId, archived }: ArchiveSegmentInput) =>
      request<SegmentResponse>(`/segments/${segmentId}/${archived ? 'archive' : 'unarchive'}`, {
        method: 'POST',
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: segmentsKeys.all }),
  });
}
