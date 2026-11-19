import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { AutomationGraph } from '@dakly/contracts/automations/graph';

import { automationKeys } from './automations';
import { useStoreRequest } from '@/lib/store-request';

export function useSaveAutomation(id: string) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (graph: AutomationGraph) =>
      request(`/automations/${id}`, { method: 'PATCH', body: { graph } }),
    onSuccess: () => client.invalidateQueries({ queryKey: automationKeys.all(contextTag) }),
  });
}

export function usePublishAutomation(id: string) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => request(`/automations/${id}/publish`, { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: automationKeys.all(contextTag) }),
  });
}
