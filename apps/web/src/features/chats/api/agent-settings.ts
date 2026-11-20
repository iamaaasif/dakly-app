import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AgentSettingsResponse,
  SaveAgentSettingsInput,
} from '@dakly/contracts/ai-agent-settings';

import { aiAgentKeys } from './ai-agent-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useAgentSettings() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: aiAgentKeys.settings(contextTag),
    enabled: Boolean(contextTag),
    retry: false,
    queryFn: ({ signal }) => request<AgentSettingsResponse>('/ai-agent/settings', { signal }),
  });
}

export function useSaveAgentSettings() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveAgentSettingsInput) =>
      request<AgentSettingsResponse>('/ai-agent/settings', { method: 'PUT', body }),
    onSuccess: (saved) => client.setQueryData(aiAgentKeys.settings(contextTag), saved),
  });
}
