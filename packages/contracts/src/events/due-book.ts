import { z } from 'zod';

const dueEventPayload = z.strictObject({ contactId: z.uuid(), entryId: z.uuid() });

const dueEventSchema = z.strictObject({
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: dueEventPayload,
});

export const dueAddedEventSchema = dueEventSchema.extend({ type: z.literal('due.added') });
export const duePaymentRecordedEventSchema = dueEventSchema.extend({
  type: z.literal('due.payment_recorded'),
});
export const dueWrittenOffEventSchema = dueEventSchema.extend({
  type: z.literal('due.written_off'),
});

// A reminder is stored first and delivered by the subscriber, so a stopped process loses nothing.
export const dueReminderRequestedEventSchema = z.strictObject({
  type: z.literal('due.reminder_requested'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ contactId: z.uuid(), messageId: z.uuid() }),
});
