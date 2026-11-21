import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ContentPiece } from '@dakly/contracts/content';

import { contentKeys } from './content-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useUpdatePiece(id: string) {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      request<ContentPiece>(`/content-pieces/${id}`, { method: 'PATCH', body: { body } }),
    onSuccess: () => client.invalidateQueries({ queryKey: contentKeys.pieces(contextTag) }),
  });
}
