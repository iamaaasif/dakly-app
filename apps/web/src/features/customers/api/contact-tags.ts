import { useQuery } from '@tanstack/react-query';

import { customersKeys } from './customers-keys';
import { useStoreRequest } from '@/lib/store-request';

// Every tag on the shop's contacts, for the tag filter.
export function useContactTags() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: customersKeys.tags(contextTag),
    queryFn: ({ signal }) => request<string[]>('/contacts/tags', { signal }),
    enabled: Boolean(contextTag),
    retry: false,
  });
}
