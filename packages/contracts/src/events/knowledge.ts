import { z } from 'zod';

export const knowledgeIndexRequestedEventSchema = z.strictObject({
  type: z.literal('knowledge.index_requested'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ knowledgeItemId: z.uuid() }),
});
