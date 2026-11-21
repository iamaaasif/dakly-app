import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ContentWriteInput, ContentWriteResult } from '@dakly/contracts/content-writing';

import { contentKeys } from './content-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useWriteContent() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: (input: ContentWriteInput) =>
      request<ContentWriteResult>('/content-pieces/generate', { method: 'POST', body: input }),
    // A written set uses credits, so the meter reads them again.
    onSettled: () => client.invalidateQueries({ queryKey: contentKeys.credits(contextTag) }),
  });
}
