import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CreateHandPickedSegmentInput,
  HandPickedChangeResponse,
  SegmentListResponse,
  SegmentResponse,
} from '@dakly/contracts/segments';

import { useStoreRequest } from '@/lib/store-request';

const segmentsKey = ['segments'] as const;

// A segment made from picked customers is one "customer is any of" condition and nothing else.
function isHandPicked(segment: SegmentResponse): boolean {
  const [only] = segment.rules.conditions;
  return (
    segment.rules.conditions.length === 1 &&
    Boolean(only) &&
    !('match' in only!) &&
    only!.field === 'contact' &&
    only!.operator === 'is_any_of'
  );
}

export function useHandPickedSegments(enabled: boolean) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: [...segmentsKey, contextTag, 'hand-picked'],
    queryFn: async ({ signal }) => {
      const { items } = await request<SegmentListResponse>('/segments?limit=100&status=active', {
        signal,
      });
      return items.filter(isHandPicked);
    },
    enabled: enabled && Boolean(contextTag),
  });
}

export function useCreateHandPickedSegment() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateHandPickedSegmentInput) =>
      request<SegmentResponse>('/segments/hand-picked', { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: segmentsKey }),
  });
}

export function useDeleteSegment() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (segmentId: string) =>
      request<void>(`/segments/${segmentId}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: segmentsKey }),
  });
}

type SegmentCustomers = { segmentId: string; contactIds: string[] };

function useSegmentCustomersRequest(action: 'customers' | 'customers/remove') {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ segmentId, contactIds }: SegmentCustomers) =>
      request<HandPickedChangeResponse>(`/segments/${segmentId}/${action}`, {
        method: 'POST',
        body: { contactIds },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: segmentsKey }),
  });
}

export const useAddCustomersToSegment = () => useSegmentCustomersRequest('customers');

// Undo of Add to segment, sent with only the customers that were added.
export const useRemoveCustomersFromSegment = () => useSegmentCustomersRequest('customers/remove');
