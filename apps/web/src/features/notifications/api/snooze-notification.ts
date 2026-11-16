import type { SnoozeNotificationInput } from '@dakly/contracts/notifications';

import { useNotificationMutation } from '../hooks/use-notification-mutation';

export function useSnoozeNotification(notificationId: string) {
  return useNotificationMutation<SnoozeNotificationInput>((request, body) =>
    request<void>(`/notifications/${notificationId}/snooze`, { method: 'POST', body }),
  );
}
