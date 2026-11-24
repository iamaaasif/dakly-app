import { useMutation } from '@tanstack/react-query';

import type { CreateStoreInput, StoreResponse } from '@dakly/contracts/stores';

import { apiPost } from '@/lib/api-client';

// The sign-up page has no shop session yet, so unlike the setup screen it sends no context tag.
export function useCreateFirstShop() {
  return useMutation({
    mutationFn: (input: CreateStoreInput) => apiPost<StoreResponse>('/stores', input),
  });
}
