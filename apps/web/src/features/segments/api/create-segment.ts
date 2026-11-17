import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CreateSegmentInput, SegmentResponse } from '@dakly/contracts/segments';

import { segmentsKeys } from './segments-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useCreateSegment() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSegmentInput) =>
      request<SegmentResponse>('/segments', { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: segmentsKeys.all }),
  });
}
