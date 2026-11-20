import { z } from 'zod';

export const attributionOrdersRebuiltEventSchema = z.strictObject({
  type: z.literal('attribution.orders_rebuilt'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ orderIds: z.array(z.uuid()).min(1).max(25) }),
});
