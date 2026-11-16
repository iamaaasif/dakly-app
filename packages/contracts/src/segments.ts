import { z } from 'zod';

import { consentChannels, contactKinds, contactSources } from './contacts';

// Feature 03: at most 20 conditions, in a top group with one level of groups inside it.
export const MAX_SEGMENT_CONDITIONS = 20;

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

export const segmentPreviewSchema = z.strictObject({ rules: segmentRulesSchema });

export type SegmentPreviewInput = z.infer<typeof segmentPreviewSchema>;
export type SegmentCountResponse = { count: number };
