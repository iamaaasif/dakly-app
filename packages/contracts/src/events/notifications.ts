import { z } from 'zod';

import { notificationCategories } from '../platform';

// One event per notification row, so the live stream can send it to that one user.
export const notificationCreatedEventSchema = z.strictObject({
  type: z.literal('notification.created'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({
    notificationId: z.uuid(),
    userId: z.uuid(),
    category: z.enum(notificationCategories),
  }),
});
