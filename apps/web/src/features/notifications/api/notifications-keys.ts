import type { NotificationCategory } from '@dakly/contracts/notifications';

export const notificationsKeys = {
  all: ['notifications'] as const,
  list: (tag: string | undefined, category?: NotificationCategory) =>
    ['notifications', tag, 'list', category] as const,
  unread: (tag: string | undefined) => ['notifications', tag, 'unread'] as const,
};
