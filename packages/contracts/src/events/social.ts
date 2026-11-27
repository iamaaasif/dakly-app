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

const postResult = z.strictObject({ postId: z.uuid(), postTargetId: z.uuid() });

export const postPublishedEventSchema = postScheduledEventSchema.extend({
  type: z.literal('post.published'),
  payload: postResult.extend({ externalPostId: z.string().min(1).nullable() }),
});

export const postFailedEventSchema = postScheduledEventSchema.extend({
  type: z.literal('post.failed'),
  payload: postResult.extend({ errorCode: z.string().min(1) }),
});

export const commentReceivedEventSchema = z.strictObject({
  type: z.literal('comment.received'),
  storeId: z.uuid(),
  occurredAt: z.iso.datetime(),
  payload: z.strictObject({ commentId: z.uuid() }),
});
