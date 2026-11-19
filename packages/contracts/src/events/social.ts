import { z } from 'zod';

export const postScheduledEventSchema = z.strictObject({
  type: z.literal('post.scheduled'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({
    postId: z.uuid(),
    postTargetId: z.uuid(),
    scheduledFor: z.iso.datetime(),
  }),
});
