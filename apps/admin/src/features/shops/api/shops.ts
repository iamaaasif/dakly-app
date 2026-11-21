import { useQuery } from '@tanstack/react-query';

import type { AdminShopDetail, AdminShopListResponse } from '@dakly/contracts/admin-shops';

import { shopsKeys } from './shops-keys';
import { adminApi } from '@/lib/api-client';

export function useShops(query: string) {
  return useQuery({
    queryKey: shopsKeys.list(query),
    queryFn: () => adminApi<AdminShopListResponse>(`stores?${query}`),
  });
}

export function useShop(storeId: string) {
  return useQuery({
    queryKey: shopsKeys.detail(storeId),
    queryFn: () => adminApi<AdminShopDetail>(`stores/${storeId}`),
  });
}
