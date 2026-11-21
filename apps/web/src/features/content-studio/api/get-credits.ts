import { useQuery } from '@tanstack/react-query';

import type { ContentCredits } from '@dakly/contracts/content-writing';

import { contentKeys } from './content-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useContentCredits() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: contentKeys.credits(contextTag),
    enabled: Boolean(contextTag),
    queryFn: ({ signal }) => request<ContentCredits>('/content-pieces/credits', { signal }),
  });
}
