import { z } from 'zod';

import { notificationCategories, notificationStatuses } from './platform';

export const notificationListQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  category: z.enum(notificationCategories).optional(),
  status: z.enum(notificationStatuses).optional(),
});
export const snoozeNotificationSchema = z.strictObject({ until: z.iso.datetime() });
export const lastEventIdSchema = z.uuid().optional();

export type NotificationCategory = (typeof notificationCategories)[number];
export type NotificationStatus = (typeof notificationStatuses)[number];
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
export type SnoozeNotificationInput = z.infer<typeof snoozeNotificationSchema>;
export type NotificationResponse = {
  id: string;
  type: string;
  category: NotificationCategory;
  priority: number;
  title: string;
  body: string | null;
  actionUrl: string | null;
  status: NotificationStatus;
  snoozedUntil: string | null;
  createdAt: string;
};
export type NotificationListResponse = { items: NotificationResponse[]; nextCursor: string | null };
