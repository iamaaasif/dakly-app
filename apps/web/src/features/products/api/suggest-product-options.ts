import { useMutation } from '@tanstack/react-query';

import type {
  SuggestedOptionsResponse,
  SuggestProductOptionsInput,
} from '@dakly/contracts/products';

import { useStoreRequest } from '@/lib/store-request';

export function useSuggestProductOptions() {
  const { request } = useStoreRequest();
  return useMutation({
    gcTime: 0,
    mutationFn: (input: SuggestProductOptionsInput) =>
      request<SuggestedOptionsResponse>('/products/suggest-options', {
        method: 'POST',
        body: input,
      }),
  });
}
