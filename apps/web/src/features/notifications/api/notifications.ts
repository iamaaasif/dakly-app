import { useInfiniteQuery } from '@tanstack/react-query';

import type {
  NotificationCategory,
  NotificationListResponse,
} from '@dakly/contracts/notifications';

import { notificationsKeys } from './notifications-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useNotifications(category?: NotificationCategory) {
  const { request, contextTag } = useStoreRequest();
  return useInfiniteQuery({
    queryKey: notificationsKeys.list(contextTag, category),
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) => {
      const query = new URLSearchParams({ limit: '50' });
      if (category) query.set('category', category);
      if (pageParam) query.set('cursor', pageParam);
      return request<NotificationListResponse>(`/notifications?${query}`, { signal });
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(contextTag),
  });
}
