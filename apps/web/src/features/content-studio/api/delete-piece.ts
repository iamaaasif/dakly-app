import { useMutation, useQueryClient } from '@tanstack/react-query';

import { contentKeys } from './content-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useDeletePiece() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<void>(`/content-pieces/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: contentKeys.pieces(contextTag) }),
  });
}
