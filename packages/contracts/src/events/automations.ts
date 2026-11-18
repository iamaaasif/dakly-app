import { z } from 'zod';

import { createAutomationSchema } from '../automations';

export const automationPausedEventSchema = z.strictObject({
  type: z.literal('automation.paused'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({
    automationId: z.uuid(),
    automationName: createAutomationSchema.shape.name,
    reason: z.literal('balance'),
  }),
});
