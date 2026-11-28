import { z } from 'zod';

import { bulkContactIds, consentChannels, contactKinds, contactSources } from './contacts';

// Feature 03: at most 20 conditions, in a top group with one level of groups inside it.
export const MAX_SEGMENT_CONDITIONS = 20;
export const MAX_SEGMENTS_PER_STORE = 200;
// A hand-picked segment lists its customers by id inside its rules, so it stays small.
export const MAX_HAND_PICKED_CONTACTS = 500;

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
  // Customers chosen by hand on the list. "Is not" leaves those customers out of a bigger segment.
  z.strictObject({
    field: z.literal('contact'),
    operator: z.enum(['is_any_of', 'is_none_of']),
    values: z.array(z.uuid()).min(1).max(MAX_HAND_PICKED_CONTACTS),
  }),
  listCondition('source', z.enum(contactSources)),
  // Not a customer contacts never match a segment, so they cannot be asked for.
  listCondition('kind', z.enum(contactKinds).exclude(['not_customer'])),
  // Net spend and order count are the same numbers the customer list shows (contact_stats).
  z.strictObject({
    field: z.literal('total_spent'),
    operator: z.enum(['at_least', 'at_most']),
    amountPoisha: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  }),
  z.strictObject({
    field: z.literal('order_count'),
    operator: z.enum(['at_least', 'at_most']),
    count: z.number().int().min(0).max(100_000),
  }),
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
// Without a name the customers are a one-off audience for one campaign and are never listed.
export const createHandPickedSegmentSchema = z.strictObject({
  name: segmentNameSchema.optional(),
  contactIds: bulkContactIds,
});
export const handPickedChangeSchema = z.strictObject({ contactIds: bulkContactIds });
export const segmentPreviewSchema = z.strictObject({ rules: segmentRulesSchema });
export const segmentStatuses = ['all', 'active', 'archived'] as const;
export const segmentListQuerySchema = z.strictObject({
  status: z.enum(segmentStatuses).default('all'),
  search: z.string().trim().min(1).max(80).optional(),
  // One-off audiences are listed only when asked for by id, as a campaign draft does for its own.
  include: z
    .string()
    .transform((value) => value.split(','))
    .pipe(z.array(z.uuid()).max(10))
    .optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateSegmentInput = z.infer<typeof createSegmentSchema>;
export type ChangeSegmentInput = z.infer<typeof changeSegmentSchema>;
export type CreateHandPickedSegmentInput = z.infer<typeof createHandPickedSegmentSchema>;
export type HandPickedChangeInput = z.infer<typeof handPickedChangeSchema>;
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
// `changedIds` are the customers added or removed, which Undo sends back.
export type HandPickedChangeResponse = { segment: SegmentResponse; changedIds: string[] };
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
