import { z } from 'zod';

import { consentChannels, contactKinds, contactSources } from './contacts';

// Feature 03: at most 20 conditions, in a top group with one level of groups inside it.
export const MAX_SEGMENT_CONDITIONS = 20;
export const MAX_SEGMENTS_PER_STORE = 200;

// "Is" and "is any of" both compile as any of; "is not" as none of.
function listCondition<Field extends string, Value extends z.ZodType<string>>(
  field: Field,
  value: Value,
) {
  return z.strictObject({
    field: z.literal(field),
    operator: z.enum(['is_any_of', 'is_none_of']),
    values: z.array(value).min(1).max(50),
  });
}

const textSchema = z.string().trim().min(1).max(80);

export const segmentConditionSchema = z.discriminatedUnion('field', [
  listCondition('tag', textSchema),
  listCondition('district', textSchema),
  listCondition('source', z.enum(contactSources)),
  // Not a customer contacts never match a segment, so they cannot be asked for.
  listCondition('kind', z.enum(contactKinds).exclude(['not_customer'])),
  z.strictObject({
    field: z.literal('consent'),
    channel: z.enum(consentChannels),
    granted: z.boolean(),
  }),
]);

export type SegmentCondition = z.infer<typeof segmentConditionSchema>;

function groupSchema<Item extends z.ZodType>(item: Item) {
  return z.strictObject({
    match: z.enum(['all', 'any']),
    conditions: z.array(item).min(1).max(MAX_SEGMENT_CONDITIONS),
  });
}

// Two fixed levels rather than a recursive schema, so a deeply nested body is refused at the
// third level instead of overflowing the stack.
const innerGroupSchema = groupSchema(segmentConditionSchema);
export type SegmentInnerGroup = z.infer<typeof innerGroupSchema>;

export const segmentRulesSchema = groupSchema(
  z.union([segmentConditionSchema, innerGroupSchema]),
).superRefine((rules, context) => {
  let conditions = 0;
  for (const item of rules.conditions) conditions += 'match' in item ? item.conditions.length : 1;
  if (conditions > MAX_SEGMENT_CONDITIONS)
    context.addIssue({
      code: 'custom',
      message: `A segment can have at most ${MAX_SEGMENT_CONDITIONS} conditions`,
    });
});

export type SegmentRules = z.infer<typeof segmentRulesSchema>;

const segmentNameSchema = z.string().trim().min(1).max(80);

export const createSegmentSchema = z.strictObject({
  name: segmentNameSchema,
  rules: segmentRulesSchema,
});
export const changeSegmentSchema = createSegmentSchema
  .partial()
  .refine((input) => input.name !== undefined || input.rules !== undefined, 'Nothing to change');
export const segmentPreviewSchema = z.strictObject({ rules: segmentRulesSchema });
export const segmentStatuses = ['all', 'active', 'archived'] as const;
export const segmentListQuerySchema = z.strictObject({
  status: z.enum(segmentStatuses).default('all'),
  search: z.string().trim().min(1).max(80).optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateSegmentInput = z.infer<typeof createSegmentSchema>;
export type ChangeSegmentInput = z.infer<typeof changeSegmentSchema>;
export type SegmentPreviewInput = z.infer<typeof segmentPreviewSchema>;
export type SegmentListQuery = z.infer<typeof segmentListQuerySchema>;

export type SegmentResponse = {
  id: string;
  name: string;
  rules: SegmentRules;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
// The list adds each segment's live size so the table can show "24 contacts".
export type SegmentListItem = SegmentResponse & { contactCount: number };
export type SegmentListResponse = { items: SegmentListItem[]; nextCursor: string | null };
export type SegmentTabCountsResponse = { all: number; active: number; archived: number };
// Reachable counts people who agreed to marketing on that channel, before any send exclusions.
export const reachableChannels = ['whatsapp', 'sms', 'messenger'] as const;
export type SegmentCountResponse = {
  count: number;
  reachable: Record<(typeof reachableChannels)[number], number>;
};
