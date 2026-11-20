import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { BrandProfile } from '@dakly/contracts/content';

import { contentKeys } from './content-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useBrandProfile() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: contentKeys.brand(contextTag),
    enabled: Boolean(contextTag),
    queryFn: ({ signal }) => request<BrandProfile>('/brand-profile', { signal }),
  });
}

export function useSaveBrandProfile() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (profile: BrandProfile) =>
      request<BrandProfile>('/brand-profile', { method: 'PUT', body: profile }),
    onSuccess: (saved) => client.setQueryData(contentKeys.brand(contextTag), saved),
  });
}
