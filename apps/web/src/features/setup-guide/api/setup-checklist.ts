import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { SetupChecklistResponse } from '@dakly/contracts/setup-checklist';

import { useStoreRequest } from '@/lib/store-request';

const setupKeys = { all: ['setup-checklist'] as const };

export function useSetupChecklist(hasStore: boolean) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: [...setupKeys.all, contextTag],
    queryFn: ({ signal }) => request<SetupChecklistResponse>('/setup-checklist', { signal }),
    enabled: Boolean(contextTag && hasStore),
    // Always refetch on mount so the guide ticks a step after the shop saved it on another page.
    staleTime: 0,
  });
}

export function useHideSetupChecklist() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<SetupChecklistResponse>('/setup-checklist', {
        method: 'PATCH',
        body: { hidden: true },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: setupKeys.all }),
  });
}
