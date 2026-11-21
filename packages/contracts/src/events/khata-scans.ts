import { z } from 'zod';

export const khataPageQueuedEventSchema = z.strictObject({
  type: z.literal('khata_page.queued'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ pageId: z.uuid() }),
});
