import { z } from 'zod';

import { campaignChannels } from '../campaigns';
import { chatIntents } from '../chats';
import { consentChannels, consentSources, lifecycleStages } from '../contacts';
import { orderPaymentStatuses } from '../orders';
import {
  automationTriggers,
  orderTriggerKeys,
  triggerFilterFields,
  triggerKeys,
} from './catalogue';
import { usesOrderFields } from './text';

// Campaigns send on three channels. A workflow also sends on Instagram, because it answers where
// the customer wrote last.
export const automationChannels = [...campaignChannels, 'instagram'] as const;
export type AutomationChannel = (typeof automationChannels)[number];

// Limits from feature 09.
export const MAX_WORKFLOW_STEPS = 50;
export const MAX_WAIT_MINUTES = 90 * 24 * 60;
export const MAX_EXIT_CONDITIONS = 5;
export const MAX_CONDITION_PATHS = 10;
export const MAX_RANDOM_PATHS = 4;
// The same limit as a segment's conditions (feature 03).
const MAX_WORKFLOW_FILTERS = 20;
const MINUTES_IN_DAY = 24 * 60;

export const sendCategories = ['transactional', 'marketing'] as const;
export const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const stepKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const buttonKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,19}$/);
const tagSchema = z.string().trim().min(1).max(50);
const amountPoishaSchema = z.number().int().positive();
const minutesSchema = z.number().int().min(1).max(MAX_WAIT_MINUTES);
// Store time, 24-hour HH:MM.
const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

function isUnique(values: string[]) {
  return new Set(values).size === values.length;
}

const amountFilter = {
  operator: z.enum(['at_least', 'at_most']),
  amountPoisha: amountPoishaSchema,
};

const triggerFilterSchema = z.discriminatedUnion('field', [
  z.strictObject({
    field: z.literal('channel'),
    channels: z.array(z.enum(consentChannels)).min(1),
  }),
  z.strictObject({ field: z.literal('intent'), intents: z.array(z.enum(chatIntents)).min(1) }),
  z.strictObject({
    field: z.literal('keywords'),
    keywords: z.array(z.string().trim().min(1).max(50)).min(1).max(20),
  }),
  z.strictObject({
    field: z.literal('consent_source'),
    sources: z.array(z.enum(consentSources)).min(1),
  }),
  z.strictObject({ field: z.literal('tag'), tag: tagSchema }),
  z.strictObject({ field: z.literal('segment'), segmentId: z.uuid() }),
  z.strictObject({ field: z.literal('lifecycle_stage'), stage: z.enum(lifecycleStages) }),
  z.strictObject({ field: z.literal('order_total'), ...amountFilter }),
  z.strictObject({ field: z.literal('cart_total'), ...amountFilter }),
  z.strictObject({ field: z.literal('product'), productIds: z.array(z.uuid()).min(1).max(50) }),
  z.strictObject({
    field: z.literal('payment_status'),
    statuses: z.array(z.enum(orderPaymentStatuses)).min(1),
  }),
  z.strictObject({
    field: z.literal('delivery_district'),
    bdAreaIds: z.array(z.number().int().positive()).min(1).max(64),
  }),
  z.strictObject({ field: z.literal('first_order') }),
  z.strictObject({ field: z.literal('days'), days: z.number().int().min(1).max(365) }),
]);

// A condition looks at what happened since the person entered; Else covers "did not".
const conditionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('tapped'), stepKey: stepKeySchema }),
  // No button keys means any reply.
  z.strictObject({
    kind: z.literal('replied'),
    stepKey: stepKeySchema,
    buttonKeys: z.array(buttonKeySchema).max(3),
  }),
  z.strictObject({ kind: z.literal('has_tag'), tag: tagSchema }),
  z.strictObject({ kind: z.literal('in_segment'), segmentId: z.uuid() }),
  z.strictObject({ kind: z.literal('reachable'), channel: z.enum(automationChannels) }),
  z.strictObject({ kind: z.literal('placed_order') }),
]);

// Leave the workflow when this happens after entry. A goal is an exit that counts as a conversion.
// Entering a segment waits for stored segment membership (feature 03).
const exitConditionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('placed_order') }),
  z.strictObject({ kind: z.literal('order_confirmed') }),
  z.strictObject({ kind: z.literal('order_paid') }),
  z.strictObject({ kind: z.literal('order_cancelled') }),
  z.strictObject({ kind: z.literal('got_tag'), tag: tagSchema }),
  z.strictObject({ kind: z.literal('tapped_link') }),
  z.strictObject({ kind: z.literal('replied') }),
]);

const waitSchema = z.discriminatedUnion('until', [
  z.strictObject({ until: z.literal('duration'), minutes: minutesSchema }),
  z.strictObject({ until: z.literal('time_of_day'), time: timeOfDaySchema }),
  z.strictObject({ until: z.literal('weekday'), weekday: z.enum(weekdays), time: timeOfDaySchema }),
  z.strictObject({
    until: z.literal('event'),
    event: z.enum(['replied', 'tapped']),
    stepKey: stepKeySchema,
    timeoutMinutes: minutesSchema,
  }),
  // Messenger allows a free-form message for 24 hours after the customer's last message.
  z.strictObject({
    until: z.literal('window_closing'),
    minutesBefore: z
      .number()
      .int()
      .min(1)
      .max(23 * 60),
  }),
]);

const messageSchema = z.strictObject({
  text: z.string().trim().min(1).max(1024),
  messengerText: z.string().trim().min(1).max(640).optional(),
  // WhatsApp allows 3 reply buttons of up to 20 characters.
  buttons: z
    .array(z.strictObject({ key: buttonKeySchema, label: z.string().trim().min(1).max(20) }))
    .max(3)
    .refine((buttons) => isUnique(buttons.map((button) => button.key)), 'Button keys repeat'),
});

const discountSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('percent'), percent: z.number().int().min(1).max(100) }),
  z.strictObject({ kind: z.literal('amount'), amountPoisha: amountPoishaSchema }),
  z.strictObject({ kind: z.literal('free_delivery') }),
]);

export const actionSettingsSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('add_tag'), tag: tagSchema }),
  z.strictObject({ action: z.literal('remove_tag'), tag: tagSchema }),
  z.strictObject({ action: z.literal('create_task'), title: z.string().trim().min(1).max(200) }),
  z.strictObject({ action: z.literal('notify_team'), text: z.string().trim().min(1).max(500) }),
  z.strictObject({ action: z.literal('hand_to_person') }),
  z.strictObject({
    action: z.literal('give_coupon'),
    discount: discountSchema,
    validDays: z.number().int().min(1).max(90),
  }),
]);

const stepSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('wait'), wait: waitSchema, next: stepKeySchema }),
  z.strictObject({
    kind: z.literal('condition'),
    paths: z
      .array(z.strictObject({ condition: conditionSchema, next: stepKeySchema }))
      .min(1)
      .max(MAX_CONDITION_PATHS),
    elseNext: stepKeySchema,
  }),
  // A person's path comes from a hash of the run id, so a retry picks the same path.
  z.strictObject({
    kind: z.literal('random_split'),
    paths: z
      .array(z.strictObject({ percent: z.number().int().min(1).max(99), next: stepKeySchema }))
      .min(2)
      .max(MAX_RANDOM_PATHS)
      .refine((paths) => paths.reduce((sum, path) => sum + path.percent, 0) === 100, {
        message: 'Random paths must add up to 100%',
      }),
  }),
  z.strictObject({
    kind: z.literal('send'),
    category: z.enum(sendCategories),
    // Tried in this order; the first reachable channel sends.
    channels: z.array(z.enum(automationChannels)).min(1).refine(isUnique, 'Channels repeat'),
    message: messageSchema,
    ifNotReachable: z.enum(['skip', 'exit']),
    reviewBeforeSending: z.boolean(),
    next: stepKeySchema,
  }),
  z.strictObject({ kind: z.literal('action'), action: actionSettingsSchema, next: stepKeySchema }),
  z.strictObject({ kind: z.literal('exit') }),
]);
export type AutomationStep = z.infer<typeof stepSchema>;

const triggerSchema = z.strictObject({
  key: z.enum(triggerKeys),
  filters: z.array(triggerFilterSchema).max(triggerFilterFields.length),
});

const reEntrySchema = z.discriminatedUnion('rule', [
  z.strictObject({ rule: z.literal('once') }),
  z.strictObject({ rule: z.literal('every_days'), days: z.number().int().min(1).max(365) }),
  z.strictObject({ rule: z.literal('every_time') }),
]);

type GraphShape = z.infer<typeof graphShapeSchema>;
type Context = z.core.$RefinementCtx<GraphShape>;

function addIssue(context: Context, path: string[], message: string) {
  context.addIssue({ code: 'custom', message, path });
}

const graphShapeSchema = z.strictObject({
  trigger: triggerSchema,
  reEntry: reEntrySchema.default({ rule: 'every_days', days: 30 }),
  workflowFilters: z.array(conditionSchema).max(MAX_WORKFLOW_FILTERS),
  goal: exitConditionSchema.nullable(),
  exitConditions: z.array(exitConditionSchema).max(MAX_EXIT_CONDITIONS),
  firstStepKey: stepKeySchema,
  steps: z.record(stepKeySchema, stepSchema),
});

function checkTriggerFilters({ key, filters }: GraphShape['trigger'], context: Context) {
  const allowed = automationTriggers[key].filters;
  const fields = filters.map((filter) => filter.field);
  if (!isUnique(fields)) {
    addIssue(context, ['trigger'], 'A filter repeats');
  }
  for (const field of fields) {
    if (!allowed[field]) {
      addIssue(context, ['trigger'], `${key} has no ${field} filter`);
    }
  }
  for (const field of triggerFilterFields) {
    if (allowed[field] === 'required' && !fields.includes(field)) {
      addIssue(context, ['trigger'], `${key} needs a ${field} filter`);
    }
  }
}

export function nextStepKeys(step: AutomationStep): string[] {
  if (step.kind === 'exit') return [];
  if (step.kind === 'condition') return [...step.paths.map((path) => path.next), step.elseNext];
  if (step.kind === 'random_split') return step.paths.map((path) => path.next);
  return [step.next];
}

// Steps a condition or wait reads replies or taps from.
function referencedSendKeys(step: AutomationStep): string[] {
  if (step.kind === 'wait' && step.wait.until === 'event') return [step.wait.stepKey];
  if (step.kind !== 'condition') return [];
  return step.paths.flatMap(({ condition }) =>
    condition.kind === 'tapped' || condition.kind === 'replied' ? [condition.stepKey] : [],
  );
}

function checkReferences({ steps }: GraphShape, context: Context) {
  for (const [key, step] of Object.entries(steps)) {
    for (const next of nextStepKeys(step)) {
      if (!Object.hasOwn(steps, next)) {
        addIssue(context, ['steps', key], `Step ${key} leads to ${next}, which does not exist`);
      }
    }
    for (const sendKey of referencedSendKeys(step)) {
      if (steps[sendKey]?.kind !== 'send') {
        addIssue(context, ['steps', key], `Step ${key} reads ${sendKey}, which is not a send step`);
      }
    }
  }
}

function longestWait(step: AutomationStep): number {
  if (step.kind !== 'wait') return 0;
  const { wait } = step;
  if (wait.until === 'duration') return wait.minutes;
  if (wait.until === 'event') return wait.timeoutMinutes;
  if (wait.until === 'weekday') return 7 * MINUTES_IN_DAY;
  return MINUTES_IN_DAY;
}

// Walks every path from the first step. Returns the longest total wait to an exit, or null once
// a loop is found. Missing steps are reported by checkReferences.
function walkPaths(
  key: string,
  steps: GraphShape['steps'],
  onPath: Set<string>,
  waits: Map<string, number>,
): number | null {
  const known = waits.get(key);
  if (known !== undefined) return known;
  if (!Object.hasOwn(steps, key)) return 0;
  const step = steps[key]!;
  if (onPath.has(key)) return null;
  onPath.add(key);
  let longestAfter = 0;
  for (const next of nextStepKeys(step)) {
    const wait = walkPaths(next, steps, onPath, waits);
    if (wait === null) return null;
    longestAfter = Math.max(longestAfter, wait);
  }
  onPath.delete(key);
  const total = longestWait(step) + longestAfter;
  waits.set(key, total);
  return total;
}

function checkPaths({ firstStepKey, steps }: GraphShape, context: Context) {
  if (!Object.hasOwn(steps, firstStepKey)) {
    addIssue(context, ['firstStepKey'], 'The first step does not exist');
    return;
  }
  const longest = walkPaths(firstStepKey, steps, new Set(), new Map());
  if (longest === null) {
    addIssue(context, ['steps'], 'A path loops back to an earlier step');
  } else if (longest > MAX_WAIT_MINUTES) {
    addIssue(context, ['steps'], 'A path waits more than 90 days');
  }
}

function checkOrderFields({ trigger, steps }: GraphShape, context: Context) {
  if (orderTriggerKeys.includes(trigger.key)) return;
  for (const [key, step] of Object.entries(steps)) {
    if (
      step.kind === 'send' &&
      (usesOrderFields(step.message.text) || usesOrderFields(step.message.messengerText ?? ''))
    )
      addIssue(context, ['steps', key], 'Order fields need a trigger that starts from an order');
  }
}

// The format templates in code and the canvas both produce (A5). Every path ends at an exit.
export const automationGraphSchema = graphShapeSchema.superRefine((graph, context) => {
  if (Object.keys(graph.steps).length > MAX_WORKFLOW_STEPS) {
    addIssue(context, ['steps'], 'A workflow has at most 50 steps');
  }
  checkTriggerFilters(graph.trigger, context);
  checkOrderFields(graph, context);
  checkReferences(graph, context);
  checkPaths(graph, context);
});
export type AutomationGraph = z.infer<typeof automationGraphSchema>;
