import { useQuery } from '@tanstack/react-query';

import type { PostListResponse, PostResponse } from '@dakly/contracts/social';

import { socialKeys } from './social-keys';
import { useStoreRequest } from '@/lib/store-request';

const pageSize = 100;
const maxPages = 5;

// Posts the person can see on My posts: their own and everything scheduled or published.
// A shop posts a few times a day, so five pages of 100 cover well over a year.
export function usePosts() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: socialKeys.posts(contextTag),
    enabled: Boolean(contextTag),
    queryFn: async ({ signal }) => {
      const posts: PostResponse[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < maxPages; page += 1) {
        const query: string = `limit=${pageSize}${cursor ? `&cursor=${cursor}` : ''}`;
        const result: PostListResponse = await request<PostListResponse>(`/posts?${query}`, {
          signal,
        });
        posts.push(...result.items);
        cursor = result.nextCursor;
        if (!cursor) break;
      }
      return posts.filter(({ targets }) =>
        targets.some(({ scheduledFor, publishedAt }) => scheduledFor ?? publishedAt),
      );
    },
  });
}
