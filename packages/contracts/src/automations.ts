import { z } from 'zod';

import {
  type AutomationChannel,
  type AutomationGraph,
  automationGraphSchema,
} from './automations/graph';
import { automationTemplates, type TemplateKey } from './automations/templates';

export const automationStatuses = ['draft', 'active', 'paused', 'archived'] as const;
// Manual is the Pause button; balance is a short SMS balance, which a top-up ends on its own.
export const automationPauseReasons = ['manual', 'balance'] as const;
export const automationRunStatuses = ['waiting', 'running', 'done', 'exited', 'failed'] as const;
export const automationExitReasons = [
  'version_stopped',
  'archived',
  'goal',
  'exit_condition',
  'workflow_filter',
  'not_reachable',
  'order_not_awaiting_confirmation',
] as const;
export const automationStepKinds = [
  'trigger',
  'wait',
  'condition',
  'random_split',
  'send',
  'action',
  'goal',
  'exit',
] as const;
export type AutomationStatus = (typeof automationStatuses)[number];
export type AutomationPauseReason = (typeof automationPauseReasons)[number];
export type AutomationRunStatus = (typeof automationRunStatuses)[number];
export type AutomationExitReason = (typeof automationExitReasons)[number];
export type AutomationStepKind = (typeof automationStepKinds)[number];

export const MAX_AUTOMATIONS_PER_STORE = 100;
export const AUTOMATION_NAME_MAX = 80;

const automationNameSchema = z.string().trim().min(1).max(AUTOMATION_NAME_MAX);

const automationDraftSchema = z.strictObject({
  name: automationNameSchema,
  graph: automationGraphSchema,
});
export const createAutomationSchema = z.union([
  automationDraftSchema,
  z.strictObject({
    name: automationNameSchema,
    templateKey: z.enum(Object.keys(automationTemplates) as TemplateKey[]),
  }),
]);
export const changeAutomationSchema = automationDraftSchema
  .partial()
  .refine((input) => input.name !== undefined || input.graph !== undefined, 'Nothing to change');
export type AutomationTriggerPreview = {
  items: { id: string; contactId: string; occurredAt: string }[];
  // People with a matching event in the last 7 days; atLeast is true when the scan stopped early.
  lastSevenDays: { people: number; atLeast: boolean };
};

// Counts of people per step, over every version. Steps nobody reached are left out.
export type AutomationStepStats = {
  steps: Record<string, { reached: number; sent: number; tapped: number }>;
};

export const automationListQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;
export type ChangeAutomationInput = z.infer<typeof changeAutomationSchema>;
export type AutomationListQuery = z.infer<typeof automationListQuerySchema>;

// graph is the draft; a published version keeps its own copy.
export type AutomationResponse = {
  id: string;
  name: string;
  status: AutomationStatus;
  pauseReason: AutomationPauseReason | null;
  templateKey: string | null;
  graph: AutomationGraph;
  publishedVersionId: string | null;
  createdAt: string;
  updatedAt: string;
};
export type AutomationVersionResponse = {
  id: string;
  version: number;
  isStopped: boolean;
  publishedAt: string;
};
export type AutomationDetailResponse = AutomationResponse & {
  versions: AutomationVersionResponse[];
  activeRuns: number;
};
export type AutomationListItem = AutomationResponse & {
  trigger: AutomationGraph['trigger']['key'];
  stepCount: number;
  channels: AutomationChannel[];
  enteredLast30Days: number;
  attributedRevenuePoisha: string;
};
export type AutomationListResponse = { items: AutomationListItem[]; nextCursor: string | null };
