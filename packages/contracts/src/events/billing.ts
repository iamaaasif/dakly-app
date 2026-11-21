import { z } from 'zod';

const subscriptionEventSchema = z.strictObject({
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
});

export const subscriptionRenewedEventSchema = subscriptionEventSchema.extend({
  type: z.literal('subscription.renewed'),
  payload: z.strictObject({ subscriptionId: z.uuid() }),
});

// Sent when the renewal is first missed and again at each retry, so reminders follow the schedule.
export const subscriptionPastDueEventSchema = subscriptionEventSchema.extend({
  type: z.literal('subscription.past_due'),
  payload: z.strictObject({ subscriptionId: z.uuid(), attempt: z.int().min(0).max(3) }),
});

export const subscriptionReadOnlyEventSchema = subscriptionEventSchema.extend({
  type: z.literal('subscription.read_only'),
  payload: z.strictObject({ subscriptionId: z.uuid() }),
});
