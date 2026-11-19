import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  AUTOMATION_NAME_MAX,
  type AutomationListItem,
  type AutomationResponse,
  type CreateAutomationInput,
} from '@dakly/contracts/automations';

import { automationKeys } from './automations';
import { useStoreRequest } from '@/lib/store-request';

export function useChangeAutomationStatus() {
  const { contextTag, request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'enable' | 'pause' | 'archive' }) =>
      request(`/automations/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: automationKeys.all(contextTag) }),
  });
}

export function useDuplicateAutomation() {
  const { contextTag, request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ name, graph }: Pick<AutomationListItem, 'name' | 'graph'>) => {
      const suffix = ' copy';
      return request<AutomationResponse>('/automations', {
        method: 'POST',
        body: { name: name.slice(0, AUTOMATION_NAME_MAX - suffix.length) + suffix, graph },
      });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: automationKeys.all(contextTag) }),
  });
}

export function useCreateAutomation() {
  const { contextTag, request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draft: CreateAutomationInput) =>
      request<AutomationResponse>('/automations', { method: 'POST', body: draft }),
    onSuccess: () => client.invalidateQueries({ queryKey: automationKeys.all(contextTag) }),
  });
}
