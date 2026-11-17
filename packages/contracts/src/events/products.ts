import { z } from 'zod';

export const productUpdatedEventSchema = z.strictObject({
  type: z.literal('product.updated'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ productId: z.uuid() }),
});
