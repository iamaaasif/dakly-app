import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ChangeSetupChecklistInput,
  SetupChecklistResponse,
} from '@dakly/contracts/setup-checklist';

import { notifySessionChange } from '@/lib/notify-session-change';
import { useStoreRequest } from '@/lib/store-request';

const setupKeys = { all: ['setup-checklist'] as const };

export function useSetupChecklist(hasStore: boolean) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: [...setupKeys.all, contextTag],
    queryFn: ({ signal }) => request<SetupChecklistResponse>('/setup-checklist', { signal }),
    enabled: Boolean(contextTag && hasStore),
  });
}

export function useChangeSetupChecklist() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangeSetupChecklistInput) =>
      request<SetupChecklistResponse>('/setup-checklist', { method: 'PATCH', body }),
    onSuccess: async ({ turnedOn }) => {
      // New extensions change the menu, so the session context is read again.
      if (turnedOn.length) {
        window.dispatchEvent(new Event('dakly-context-changed'));
        notifySessionChange();
      }
      await client.invalidateQueries({ queryKey: setupKeys.all });
    },
  });
}
