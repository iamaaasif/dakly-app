import { z } from 'zod';

import { attributionSourceTypes } from '../orders';

export const attributionCreatedEventSchema = z.strictObject({
  type: z.literal('attribution.created'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({
    orderId: z.uuid(),
    sourceType: z.enum(attributionSourceTypes),
    sourceId: z.uuid(),
  }),
});

export const attributionRemovedEventSchema = z.strictObject({
  type: z.literal('attribution.removed'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ orderId: z.uuid() }),
});

export const attributionWindowChangedEventSchema = z.strictObject({
  type: z.literal('attribution.window_changed'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ rebuildId: z.uuid() }),
});
