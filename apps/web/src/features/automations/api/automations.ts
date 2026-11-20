import { useQuery } from '@tanstack/react-query';

import {
  type AutomationDetailResponse,
  type AutomationListResponse,
  type AutomationTriggerPreview,
  MAX_AUTOMATIONS_PER_STORE,
} from '@dakly/contracts/automations';

import { useStoreRequest } from '@/lib/store-request';

export const automationKeys = {
  all: (contextTag: string | undefined) => ['automations', contextTag] as const,
  list: (contextTag: string | undefined) => [...automationKeys.all(contextTag), 'list'] as const,
};

export function useAutomations() {
  const { contextTag, request } = useStoreRequest();
  return useQuery({
    queryKey: automationKeys.list(contextTag),
    queryFn: ({ signal }) =>
      request<AutomationListResponse>(`/automations?limit=${MAX_AUTOMATIONS_PER_STORE}`, {
        signal,
      }),
    enabled: Boolean(contextTag),
  });
}

export function useAutomation(id: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: [...automationKeys.all(contextTag), id],
    queryFn: ({ signal }) => request<AutomationDetailResponse>(`/automations/${id}`, { signal }),
    enabled: Boolean(contextTag),
  });
}

export function useTriggerPreview(id: string, enabled: boolean) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: [...automationKeys.all(contextTag), id, 'trigger-preview'],
    queryFn: ({ signal }) =>
      request<AutomationTriggerPreview>(`/automations/${id}/trigger-preview`, { signal }),
    enabled: Boolean(contextTag) && enabled,
  });
}
