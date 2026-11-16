import { z } from 'zod';

import { consentChannels, contactKinds, contactSources, lifecycleStages } from './contacts';

// Feature 03: at most 20 conditions, in groups at most three levels deep counting the top one.
export const MAX_SEGMENT_CONDITIONS = 20;

// The builder lists these before their data exists. They are refused until the named task
// stores it: contact stats from orders, inbound messages, campaign sends.
export const segmentFieldsWaiting = {
  orders_count: 'CUS-3',
  net_spend_poisha: 'CUS-3',
  usual_gap_days: 'CUS-3',
  first_order_at: 'CUS-3',
  last_order_at: 'CUS-3',
  lifecycle_stage: 'CUS-3',
  first_inbound_message_at: 'CHAT-1',
  last_inbound_message_at: 'CHAT-1',
  last_campaign_received_at: 'CAMP-3',
} as const;

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

function numberCondition<Field extends string>(field: Field) {
  const amount = z.number().int().min(0);
  return z.discriminatedUnion('operator', [
    z.strictObject({
      field: z.literal(field),
      operator: z.enum(['is', 'more_than', 'less_than']),
      value: amount,
    }),
    z.strictObject({
      field: z.literal(field),
      operator: z.literal('between'),
      min: amount,
      max: amount,
    }),
  ]);
}

function dateCondition<Field extends string>(field: Field) {
  return z.discriminatedUnion('operator', [
    z.strictObject({
      field: z.literal(field),
      operator: z.enum(['before', 'after']),
      value: z.iso.datetime(),
    }),
    z.strictObject({
      field: z.literal(field),
      operator: z.literal('in_last_days'),
      days: z.number().int().min(1).max(3650),
    }),
  ]);
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
  numberCondition('orders_count'),
  numberCondition('net_spend_poisha'),
  numberCondition('usual_gap_days'),
  dateCondition('first_order_at'),
  dateCondition('last_order_at'),
  listCondition('lifecycle_stage', z.enum(lifecycleStages)),
  dateCondition('first_inbound_message_at'),
  dateCondition('last_inbound_message_at'),
  dateCondition('last_campaign_received_at'),
]);

export type SegmentCondition = z.infer<typeof segmentConditionSchema>;
export type AvailableSegmentCondition = Exclude<
  SegmentCondition,
  { field: keyof typeof segmentFieldsWaiting }
>;
export type SegmentGroup<Condition = SegmentCondition> = {
  match: 'all' | 'any';
  conditions: (Condition | SegmentGroup<Condition>)[];
};
export type AvailableSegmentRules = SegmentGroup<AvailableSegmentCondition>;

function groupSchema<Item extends z.ZodType>(item: Item) {
  return z.strictObject({
    match: z.enum(['all', 'any']),
    conditions: z.array(item).min(1).max(MAX_SEGMENT_CONDITIONS),
  });
}

// Three fixed levels rather than a recursive schema, so a deeply nested body is refused at the
// fourth level instead of overflowing the stack.
const innerGroupSchema = groupSchema(segmentConditionSchema);
const middleGroupSchema = groupSchema(z.union([segmentConditionSchema, innerGroupSchema]));

function countConditions(group: SegmentGroup): number {
  let conditions = 0;
  for (const item of group.conditions) conditions += 'match' in item ? countConditions(item) : 1;
  return conditions;
}

export const segmentRulesSchema = groupSchema(
  z.union([segmentConditionSchema, middleGroupSchema]),
).superRefine((rules, context) => {
  if (countConditions(rules) > MAX_SEGMENT_CONDITIONS)
    context.addIssue({
      code: 'custom',
      message: `A segment can have at most ${MAX_SEGMENT_CONDITIONS} conditions`,
    });
});

export const segmentPreviewSchema = z.strictObject({ rules: segmentRulesSchema });

export type SegmentPreviewInput = z.infer<typeof segmentPreviewSchema>;
export type SegmentCountResponse = { count: number };
