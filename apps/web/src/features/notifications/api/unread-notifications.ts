import { useQuery } from '@tanstack/react-query';

import type { NotificationListResponse } from '@dakly/contracts/notifications';

import { notificationsKeys } from './notifications-keys';
import { useStoreRequest } from '@/lib/store-request';

// The API has no count route, so the bell reads one page of new cards and shows "100+" past it.
export function useUnreadNotifications() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: notificationsKeys.unread(contextTag),
    queryFn: ({ signal }) =>
      request<NotificationListResponse>('/notifications?status=new&limit=100', { signal }),
    enabled: Boolean(contextTag),
  });
}
