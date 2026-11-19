import { z } from 'zod';

import { type AutomationGraph, automationGraphSchema } from './automations/graph';
import { automationTemplates, type TemplateKey } from './automations/templates';
import type { CampaignChannel } from './campaigns';

export const automationStatuses = ['draft', 'active', 'paused', 'archived'] as const;
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
export type AutomationRunStatus = (typeof automationRunStatuses)[number];
export type AutomationExitReason = (typeof automationExitReasons)[number];
export type AutomationStepKind = (typeof automationStepKinds)[number];

export const MAX_AUTOMATIONS_PER_STORE = 100;

const automationNameSchema = z.string().trim().min(1).max(80);

const automationFieldsSchema = z.strictObject({
  name: automationNameSchema,
  graph: automationGraphSchema,
});
export const createAutomationSchema = automationFieldsSchema.extend({
  templateKey: z.enum(Object.keys(automationTemplates) as TemplateKey[]).optional(),
});
const draftChangeSchema = automationFieldsSchema.partial();
export const changeAutomationSchema = draftChangeSchema.refine(
  (input) => input.name !== undefined || input.graph !== undefined,
  'Nothing to change',
);
export const publishAutomationSchema = draftChangeSchema.optional();
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
  channels: CampaignChannel[];
  enteredLast30Days: number;
};
export type AutomationListResponse = { items: AutomationListItem[]; nextCursor: string | null };
