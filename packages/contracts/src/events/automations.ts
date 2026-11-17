import { z } from 'zod';

export const automationPausedEventSchema = z.strictObject({
  type: z.literal('automation.paused'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ automationId: z.uuid(), reason: z.literal('balance') }),
});
