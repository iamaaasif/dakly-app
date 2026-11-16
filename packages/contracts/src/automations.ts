import { z } from 'zod';

import { type AutomationGraph, automationGraphSchema } from './automations/graph';

export const automationStatuses = ['draft', 'active', 'paused', 'archived'] as const;
export const automationRunStatuses = ['waiting', 'running', 'done', 'exited', 'failed'] as const;
export const automationStepKinds = [
  'trigger',
  'wait',
  'condition',
  'random',
  'send',
  'action',
  'goal',
  'exit',
] as const;
export type AutomationStatus = (typeof automationStatuses)[number];

export const MAX_AUTOMATIONS_PER_STORE = 100;

const automationNameSchema = z.string().trim().min(1).max(80);

export const createAutomationSchema = z.strictObject({
  name: automationNameSchema,
  graph: automationGraphSchema,
});
export const changeAutomationSchema = createAutomationSchema
  .partial()
  .refine((input) => input.name !== undefined || input.graph !== undefined, 'Nothing to change');
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
