import { z } from 'zod';

import { bdMobileSchema } from './phone';

export const orderLinkSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{2,39}$/);
const orderLinkAddress = {
  address: z.string().trim().min(1).max(500),
  areaId: z.int().positive().max(2147483647),
};
// The buyer sends no price, discount or delivery charge; the server works all three out.
export const placeOrderLinkOrderSchema = z.strictObject({
  botCheckToken: z.string().min(1).max(2048),
  idempotencyKey: z.uuid(),
  variantId: z.uuid().toLowerCase(),
  quantity: z.int().min(1).max(20),
  buyer: z.strictObject({ name: z.string().trim().min(1).max(120), phone: bdMobileSchema }),
  recipient: z.discriminatedUnion('isBuyer', [
    z.strictObject({ isBuyer: z.literal(true), ...orderLinkAddress }),
    z.strictObject({
      isBuyer: z.literal(false),
      name: z.string().trim().min(1).max(120),
      phone: bdMobileSchema,
      ...orderLinkAddress,
    }),
  ]),
});
export type PlaceOrderLinkOrderInput = z.infer<typeof placeOrderLinkOrderSchema>;
export type PlacedOrderLinkOrder = { orderNumber: number; totalPoisha: number };
// The public page where a customer orders one product themselves.
export type OrderLinkUrlResponse = { url: string };
