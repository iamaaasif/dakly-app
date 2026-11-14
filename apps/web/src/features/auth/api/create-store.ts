import { notifySessionChange } from '@/lib/notify-session-change';
import { useMutation } from '@tanstack/react-query';
import type { CreateStoreInput, StoreResponse } from '@dakly/contracts/stores';
import { apiPost } from '@/lib/api-client';
export function useCreateStore() {
  return useMutation({
    mutationFn: (input: CreateStoreInput) =>
      apiPost<StoreResponse>('/stores', input).then((result) => {
        notifySessionChange();
        return result;
      }),
  });
}
