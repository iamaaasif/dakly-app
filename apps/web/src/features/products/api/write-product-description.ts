import { useMutation } from '@tanstack/react-query';

import type { ContentWriteResult, ProductDescriptionInput } from '@dakly/contracts/content-writing';

import { useStoreRequest } from '@/lib/store-request';

export function useWriteProductDescription(productId: string) {
  const { request } = useStoreRequest();
  return useMutation({
    gcTime: 0,
    mutationFn: (input: ProductDescriptionInput) =>
      request<ContentWriteResult>(`/products/${productId}/write-description`, {
        method: 'POST',
        body: input,
      }),
  });
}
