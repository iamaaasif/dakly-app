import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AutomationDetailResponse, ChangeAutomationInput } from '@dakly/contracts/automations';

import { automationKeys } from './automations';
import { useStoreRequest } from '@/lib/store-request';

export function useAutomation(id: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: [...automationKeys.all(contextTag), id],
    queryFn: ({ signal }) => request<AutomationDetailResponse>(`/automations/${id}`, { signal }),
    enabled: Boolean(contextTag),
  });
}

export function useSaveAutomation(id: string) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ draft, publish }: { draft: ChangeAutomationInput; publish: boolean }) => {
      await request(`/automations/${id}`, { method: 'PATCH', body: draft });
      if (publish) await request(`/automations/${id}/publish`, { method: 'POST' });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: automationKeys.all(contextTag) }),
  });
}
