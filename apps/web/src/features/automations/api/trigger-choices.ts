import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { CommentResponse } from '@dakly/contracts/comments';
import type { ProductListResponse } from '@dakly/contracts/products';
import type { PostListResponse } from '@dakly/contracts/social';

import { useStoreRequest } from '@/lib/store-request';

type CommentPage = { items: CommentResponse[]; nextCursor: string | null };

// A trigger filter lists what the shop already has. Each list loads on its own, so a role that
// cannot see products still sees posts.
export function useShopPostChoices(enabled: boolean) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: ['automations', contextTag, 'choices', 'posts'],
    queryFn: ({ signal }) => request<PostListResponse>('/posts?limit=50', { signal }),
    enabled: enabled && Boolean(contextTag),
    retry: false,
  });
}

export function useCommentedPostChoices(enabled: boolean) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: ['automations', contextTag, 'choices', 'commented-posts'],
    queryFn: ({ signal }) => request<CommentPage>('/comments?limit=100', { signal }),
    enabled: enabled && Boolean(contextTag),
    retry: false,
  });
}

export function useProductChoices(search: string, enabled: boolean) {
  const { request, contextTag } = useStoreRequest();
  const query = new URLSearchParams({ limit: '30' });
  // The products list needs three letters before it searches.
  if (search.trim().length >= 3) query.set('search', search.trim());
  return useQuery({
    queryKey: ['automations', contextTag, 'choices', 'products', query.toString()],
    queryFn: ({ signal }) => request<ProductListResponse>(`/products?${query}`, { signal }),
    enabled: enabled && Boolean(contextTag),
    placeholderData: keepPreviousData,
    retry: false,
  });
}
