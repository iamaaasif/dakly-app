import { MINUTE_MS } from '../platform/time';
import type { StepResult } from './automation-step-rules';

// Matches the lease compared by due_automation_runs in Postgres.
export const WORKFLOW_LEASE_MS = 5 * MINUTE_MS;

export class WorkflowSubmissionStopped extends Error {
  constructor(readonly result: StepResult | undefined) {
    super('The workflow SMS did not pass its submission check');
  }
}
