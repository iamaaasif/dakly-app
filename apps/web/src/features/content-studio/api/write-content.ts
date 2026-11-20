import { useMutation } from '@tanstack/react-query';

import type { ContentWriteInput, ContentWriteResult } from '@dakly/contracts/content-writing';

import { useStoreRequest } from '@/lib/store-request';

export function useWriteContent() {
  const { request } = useStoreRequest();
  return useMutation({
    gcTime: 0,
    mutationFn: (input: ContentWriteInput) =>
      request<ContentWriteResult>('/content-pieces/generate', { method: 'POST', body: input }),
  });
}
