import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { AutomationResponse, CreateAutomationInput } from '@dakly/contracts/automations';

import { automationKeys } from './automations';
import { useStoreRequest } from '@/lib/store-request';

export function useAutomationAction() {
  const { contextTag, request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      input:
        { id: string; action: 'enable' | 'pause' | 'archive' } | { draft: CreateAutomationInput },
    ) =>
      'draft' in input
        ? request<AutomationResponse>('/automations', { method: 'POST', body: input.draft })
        : request<AutomationResponse | undefined>(`/automations/${input.id}/${input.action}`, {
            method: 'POST',
          }),
    onSuccess: () => client.invalidateQueries({ queryKey: automationKeys.all(contextTag) }),
  });
}
