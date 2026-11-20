import { z } from 'zod';

export const attributionWindowChangedEventSchema = z.strictObject({
  type: z.literal('attribution.window_changed'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ rebuildId: z.uuid() }),
});
