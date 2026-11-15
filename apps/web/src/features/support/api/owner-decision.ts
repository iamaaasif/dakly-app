import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supportKeys } from './support-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useOwnerDecision() {
  const store = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      action: 'code' | 'approve' | 'deny' | 'end';
      code?: string;
    }) =>
      store.request(`/support-access/${input.id}/${input.action}`, {
        body: input.code ? { code: input.code } : {},
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: supportKeys.ownerRequests(store.contextTag) }),
  });
}
