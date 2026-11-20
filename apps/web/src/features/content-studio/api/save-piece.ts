import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ContentPiece, CreateContentPieceInput } from '@dakly/contracts/content';

import { contentKeys } from './content-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useSavePiece() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContentPieceInput) =>
      request<ContentPiece>('/content-pieces', { method: 'POST', body: input }),
    onSettled: () => client.invalidateQueries({ queryKey: contentKeys.all(contextTag) }),
  });
}
