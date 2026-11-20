import { useInfiniteQuery } from '@tanstack/react-query';

import type { ContentPieceList } from '@dakly/contracts/content';

import { contentKeys } from './content-keys';
import { useStoreRequest } from '@/lib/store-request';

// Groups and search filter the loaded pages; the API only filters by one kind and language.
export function usePieces() {
  const { request, contextTag } = useStoreRequest();
  return useInfiniteQuery({
    queryKey: contentKeys.pieces(contextTag),
    enabled: Boolean(contextTag),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: ContentPieceList) => page.nextCursor ?? undefined,
    queryFn: ({ pageParam, signal }) =>
      request<ContentPieceList>(
        `/content-pieces?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        { signal },
      ),
  });
}
