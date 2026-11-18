import { z } from 'zod';

import { orderStages } from '../orders';

export const orderStageChangedEventSchema = z.strictObject({
  type: z.literal('order.stage_changed'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({
    orderId: z.uuid(),
    from: z.enum(orderStages),
    to: z.enum(orderStages),
  }),
});

export const orderConfirmedEventSchema = z.strictObject({
  type: z.literal('order.confirmed'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ orderId: z.uuid() }),
});
