import { useMutation, useQueryClient } from '@tanstack/react-query';

import { segmentsKeys } from './segments-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useRemoveSegment(segmentId: string) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => request<void>(`/segments/${segmentId}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: segmentsKeys.all }),
  });
}
