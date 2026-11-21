import { z } from 'zod';

import { attributionSourceTypes, orderStages } from '../orders';

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

export const orderCreatedEventSchema = z.strictObject({
  type: z.literal('order.created'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ orderId: z.uuid() }),
});

// A past sale written by a khata import. It is not a new order, so automations, attribution and
// confirmations ignore it; only customer totals and sales numbers pick it up.
export const orderImportedEventSchema = z.strictObject({
  type: z.literal('order.imported'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ orderId: z.uuid() }),
});

export const orderEditedEventSchema = z.strictObject({
  type: z.literal('order.edited'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ orderId: z.uuid() }),
});

export const orderCodCollectedEventSchema = z.strictObject({
  type: z.literal('order.cod_collected'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ orderId: z.uuid() }),
});

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
