import { z } from 'zod';

export const postKinds = ['post', 'story'] as const;
export const postTargetStatuses = [
  'draft',
  'waiting_approval',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'cancelled',
] as const;

export const contentKinds = [
  'facebook_post',
  'instagram_caption',
  'whatsapp',
  'sms',
  'product_description',
] as const;
export const contentLanguages = ['bn', 'en', 'banglish'] as const;

export const savedContentSchema = z
  .strictObject({
    kind: z.enum(contentKinds),
    language: z.enum(contentLanguages),
    body: z.string().min(1).max(20_000),
    createdByUserId: z.uuid(),
    isAiWritten: z.boolean(),
    aiRunId: z.uuid().nullable(),
  })
  .refine(
    (content) => content.isAiWritten || content.aiRunId === null,
    'A model run requires AI provenance',
  );

export const postTargetCaptionSchema = z.strictObject({
  channelConnectionId: z.uuid(),
  // Null uses the common caption; empty text intentionally removes it for this account.
  captionOverride: z.string().max(20_000).nullable(),
});
