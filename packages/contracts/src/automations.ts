import { z } from 'zod';

import { type AutomationGraph, automationGraphSchema } from './automations/graph';

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

const automationNameSchema = z.string().trim().min(1).max(80);

export const createAutomationSchema = z.strictObject({
  name: automationNameSchema,
  graph: automationGraphSchema,
});
export const changeAutomationSchema = createAutomationSchema
  .partial()
  .refine((input) => input.name !== undefined || input.graph !== undefined, 'Nothing to change');
export type AutomationTriggerPreview = {
  items: { id: string; contactId: string; occurredAt: string }[];
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
};
export type AutomationListResponse = { items: AutomationResponse[]; nextCursor: string | null };
