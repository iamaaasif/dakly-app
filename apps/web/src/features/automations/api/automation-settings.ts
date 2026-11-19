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
    mutationFn: ({ draft, publish }: { draft: ChangeAutomationInput; publish: boolean }) =>
      request(publish ? `/automations/${id}/publish` : `/automations/${id}`, {
        method: publish ? 'POST' : 'PATCH',
        body: draft,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: automationKeys.all(contextTag) }),
  });
}
