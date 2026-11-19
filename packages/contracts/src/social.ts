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

export const postingSlotsSchema = z
  .array(
    z.strictObject({
      weekday: z.number().int().min(0).max(6),
      time: z.iso.time({ precision: -1 }),
    }),
  )
  .refine(
    (slots) =>
      new Set(slots.map(({ weekday, time }) => `${weekday}-${time}`)).size === slots.length,
    'Use each time once on a day',
  );
export type PostingSlot = z.infer<typeof postingSlotsSchema>[number];

const postIdSchema = z.uuid().transform((id) => id.toLowerCase());
const postText = z.string().refine((value) => !value.includes('\0'), 'Remove null characters');

export const postTargetCaptionSchema = z.strictObject({
  channelConnectionId: postIdSchema,
  // Null uses the common caption; empty text intentionally removes it for this account.
  captionOverride: postText.max(20_000).nullable(),
});

const postDraftSchema = z.strictObject({
  kind: z.enum(postKinds),
  caption: postText.max(20_000).nullable(),
  mediaFileIds: z.array(postIdSchema).max(10),
  linkUrl: postText
    .max(2_048)
    .pipe(z.url({ protocol: /^https?$/ }))
    .nullable(),
  firstComment: postText.max(2_200).nullable(),
  isAiWritten: z.boolean(),
  targets: z.array(postTargetCaptionSchema).max(100),
});

function hasUniqueTargets(input: { targets?: z.infer<typeof postTargetCaptionSchema>[] }) {
  const targets = input.targets ?? [];
  return (
    new Set(targets.map(({ channelConnectionId }) => channelConnectionId)).size === targets.length
  );
}

const uniqueTargets = { path: ['targets'], message: 'Select each account once' };
export const createPostSchema = postDraftSchema
  .extend({
    kind: postDraftSchema.shape.kind.default('post'),
    caption: postDraftSchema.shape.caption.default(null),
    mediaFileIds: postDraftSchema.shape.mediaFileIds.default([]),
    linkUrl: postDraftSchema.shape.linkUrl.default(null),
    firstComment: postDraftSchema.shape.firstComment.default(null),
    isAiWritten: postDraftSchema.shape.isAiWritten.default(false),
    targets: postDraftSchema.shape.targets.default([]),
  })
  .refine(hasUniqueTargets, uniqueTargets);

export const editPostSchema = postDraftSchema.partial().refine(hasUniqueTargets, uniqueTargets);

export const postIdempotencyKeySchema = z.string().trim().min(1).max(128);
export const postListQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  drafts: z.enum(['mine', 'team']).optional(),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type EditPostInput = z.infer<typeof editPostSchema>;
export type PostListQuery = z.infer<typeof postListQuerySchema>;
export type PostResponse = Omit<CreatePostInput, 'targets'> & {
  id: string;
  createdByUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  targets: (z.infer<typeof postTargetCaptionSchema> & {
    id: string;
    status: (typeof postTargetStatuses)[number];
    scheduledFor: string | null;
    publishedAt: string | null;
    externalPostId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  })[];
};
export type PostListResponse = { items: PostResponse[]; nextCursor: string | null };

export const schedulePostSchema = z.union([
  z.strictObject({
    scheduledFor: z.iso
      .datetime({ offset: true })
      .transform((time) => new Date(time).toJSON())
      .pipe(z.iso.datetime()),
  }),
  z.strictObject({ nextSlot: z.literal(true) }),
]);

export type SchedulePostInput = z.infer<typeof schedulePostSchema>;

export const postingSlotsQuerySchema = z.strictObject({ channelConnectionId: postIdSchema });
export const savePostingSlotsSchema = postingSlotsQuerySchema.extend({ slots: postingSlotsSchema });

export type PostingSlotsQuery = z.infer<typeof postingSlotsQuerySchema>;
export type SavePostingSlotsInput = z.infer<typeof savePostingSlotsSchema>;
export type PostingSlotsResponse = SavePostingSlotsInput & { timeZone: string };
