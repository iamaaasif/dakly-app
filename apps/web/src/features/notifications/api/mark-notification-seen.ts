import { useNotificationMutation } from '../hooks/use-notification-mutation';

export function useMarkNotificationSeen(notificationId: string) {
  return useNotificationMutation<void>((request) =>
    request<void>(`/notifications/${notificationId}/seen`, { method: 'POST' }),
  );
}
