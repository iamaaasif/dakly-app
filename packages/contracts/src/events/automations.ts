import { z } from 'zod';

export const automationPausedEventSchema = z.strictObject({
  type: z.literal('automation.paused'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({
    automationId: z.uuid(),
    automationName: z.string().trim().min(1).max(80),
    reason: z.literal('balance'),
  }),
});
