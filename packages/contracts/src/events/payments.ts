import { z } from 'zod';

const paymentEventSchema = z.strictObject({
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ paymentIntentId: z.uuid() }),
});

export const paymentVerificationRequestedEventSchema = paymentEventSchema.extend({
  type: z.literal('payment.verification_requested'),
});

export const paymentSucceededEventSchema = paymentEventSchema.extend({
  type: z.literal('payment.succeeded'),
});

export const paymentFailedEventSchema = paymentEventSchema.extend({
  type: z.literal('payment.failed'),
});
