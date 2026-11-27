import { z } from 'zod';

import type { AreaSearchResult } from './delivery';
import { bdMobileSchema } from './phone';

// Phone entry on the new order page: either the number typed, or a contact picked from the list.
export const orderCustomerLookupQuerySchema = z.union([
  z.strictObject({ phone: bdMobileSchema }),
  z.strictObject({ contactId: z.uuid() }),
]);
export type OrderCustomerLookupQuery = z.infer<typeof orderCustomerLookupQuerySchema>;
export type OrderCustomerLookup = {
  customer: {
    contactId: string;
    name: string | null;
    // Null when the member cannot see full numbers and looked the contact up by id.
    phone: string | null;
    // The last order this customer received themselves; null when they never did.
    address: string | null;
    area: AreaSearchResult | null;
  } | null;
  // Orders to this phone that are not delivered, returned or cancelled.
  openOrders: number;
};

export const orderChatFillSchema = z.strictObject({ text: z.string().trim().min(1).max(4000) });
export type OrderChatFillInput = z.infer<typeof orderChatFillSchema>;
// What the model may read out of a pasted chat. There is no price, quantity or product on purpose.
export const orderChatFillModelSchema = z.strictObject({
  name: z.string().trim().max(120).nullable(),
  phone: z.string().trim().max(30).nullable(),
  address: z.string().trim().max(500).nullable(),
  area: z.string().trim().max(80).nullable(),
});
export type OrderChatFill = {
  name: string | null;
  phone: string | null;
  address: string | null;
  // Only when the place the customer wrote is exact or the only match.
  area: AreaSearchResult | null;
};
