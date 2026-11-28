import { useQuery } from '@tanstack/react-query';

import type { BrandProfile } from '@dakly/contracts/content';

import { socialKeys } from './social-keys';
import { useStoreRequest } from '@/lib/store-request';

// The shop's saved hashtags, offered as suggestions under the caption; a failure only hides them.
export function useBrandHashtags() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: [...socialKeys.all(contextTag), 'brand-hashtags'],
    enabled: Boolean(contextTag),
    queryFn: ({ signal }) => request<BrandProfile>('/brand-profile', { signal }),
    select: ({ hashtags }) => hashtags,
  });
}
