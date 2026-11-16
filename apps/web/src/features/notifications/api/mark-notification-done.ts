import { useNotificationMutation } from '../hooks/use-notification-mutation';

export function useMarkNotificationDone(notificationId: string) {
  return useNotificationMutation<void>((request) =>
    request<void>(`/notifications/${notificationId}/done`, { method: 'POST' }),
  );
}
