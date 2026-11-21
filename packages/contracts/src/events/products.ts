import { z } from 'zod';

import { stockMovementKinds } from '../products';

export const productUpdatedEventSchema = z.strictObject({
  type: z.literal('product.updated'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ productId: z.uuid() }),
});

// Raised when a photo is confirmed, so the AI can tag it (PROD-8).
export const productPhotoAddedEventSchema = z.strictObject({
  type: z.literal('product.photo_added'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ productId: z.uuid(), fileId: z.uuid() }),
});

export const stockChangedEventSchema = z.strictObject({
  type: z.literal('stock.changed'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ variantId: z.uuid(), kind: z.enum(stockMovementKinds) }),
});
export const variantRestockedEventSchema = z.strictObject({
  type: z.literal('variant.restocked'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ variantId: z.uuid() }),
});
