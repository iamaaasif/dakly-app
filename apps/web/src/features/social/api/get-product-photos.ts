import { useQuery } from '@tanstack/react-query';

import type { ProductListResponse } from '@dakly/contracts/products';

import { socialKeys } from './social-keys';
import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

export type ProductWithPhotos = { id: string; name: string; photos: { id: string; url: string }[] };

// Products that have at least one photo; the first page holds enough to choose from.
export function useProductPhotos(enabled: boolean) {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: socialKeys.productPhotos(contextTag),
    enabled: enabled && Boolean(contextTag && data?.currentStore?.canViewProducts),
    queryFn: async ({ signal }): Promise<ProductWithPhotos[]> => {
      const page = await request<ProductListResponse>('/products?limit=50', { signal });
      return page.items
        .filter(({ photos }) => photos.length > 0)
        .map(({ id, name, photos }) => ({ id, name, photos }));
    },
  });
}
