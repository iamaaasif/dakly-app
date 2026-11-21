import { z } from 'zod';

import { restockRequestStatuses } from './products';

export const MAX_RESTOCK_NOTIFICATIONS_PER_APPROVAL = 50;

export const addRestockRequestSchema = z.strictObject({
  contactId: z.uuid(),
  conversationId: z.uuid().optional(),
});

export const restockRequestListQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  variantId: z.uuid().optional(),
  status: z.enum(restockRequestStatuses).default('waiting'),
});

export type AddRestockRequestInput = z.infer<typeof addRestockRequestSchema>;
export type RestockRequestListQuery = z.infer<typeof restockRequestListQuerySchema>;

export type RestockRequestResponse = {
  id: string;
  variantId: string;
  contactId: string;
  conversationId: string | null;
  status: (typeof restockRequestStatuses)[number];
  notifiedAt: string | null;
  createdAt: string;
};

export type RestockRequestListResponse = {
  items: RestockRequestResponse[];
  nextCursor: string | null;
};

// Rows left waiting are people with no chat to reach or past the per-approval limit.
export type RestockNotificationResponse = { queued: number; waiting: number };

export type RestockWaitingResponse = { items: { variantId: string; waiting: number }[] };
