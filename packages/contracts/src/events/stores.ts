import { z } from 'zod';

export const attributionWindowChangedEventSchema = z.strictObject({
  type: z.literal('attribution.window_changed'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ rebuildId: z.uuid() }),
});

export const attributionRebuildContinuedEventSchema = z.strictObject({
  type: z.literal('attribution.rebuild_continued'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ rebuildId: z.uuid(), afterOrderId: z.uuid() }),
});
