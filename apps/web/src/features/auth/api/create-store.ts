import { useMutation } from '@tanstack/react-query';

import type { CreateStoreInput, StoreResponse } from '@dakly/contracts/stores';

import { apiPost } from '@/lib/api-client';
import { notifySessionChange } from '@/lib/notify-session-change';
import { useSessionContext } from '@/lib/session-context';

export function useCreateStore() {
  const { data: session } = useSessionContext();
  return useMutation({
    mutationFn: (input: CreateStoreInput) =>
      apiPost<StoreResponse>('/stores', input, { contextTag: session?.contextTag }).then(
        (result) => {
          notifySessionChange();
          return result;
        },
      ),
  });
}
