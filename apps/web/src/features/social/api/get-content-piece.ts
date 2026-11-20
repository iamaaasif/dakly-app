import { useQuery } from '@tanstack/react-query';

import type { ContentPiece } from '@dakly/contracts/content';

import { useStoreRequest } from '@/lib/store-request';

// The piece Content Studio hands over with "Use in post".
export function useContentPiece(pieceId: string | null) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: ['social', contextTag, 'content-piece', pieceId],
    enabled: Boolean(contextTag && pieceId),
    queryFn: ({ signal }) => request<ContentPiece>(`/content-pieces/${pieceId}`, { signal }),
  });
}
