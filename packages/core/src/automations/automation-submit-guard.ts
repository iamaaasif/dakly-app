import type { StoreTransaction } from '../platform/database/store-transaction';
import { MINUTE_MS } from '../platform/time';
import type { AutomationRunsRepository, RunClaim } from './automation-runs.repository';
import {
  failed,
  goOn,
  isLateSend,
  type RunFacts,
  type SendStep,
  type StepResult,
} from './automation-step-rules';

// Matches the lease compared by due_automation_runs in Postgres.
export const WORKFLOW_LEASE_MS = 5 * MINUTE_MS;

export class WorkflowSubmissionStopped extends Error {
  constructor(readonly result: StepResult | undefined) {
    super('The workflow SMS did not pass its submission check');
  }
}

type FirstSubmissionInput = {
  transaction: StoreTransaction;
  repository: Pick<AutomationRunsRepository, 'moveRun' | 'schedulerTime'>;
  facts: Pick<RunFacts, 'storeId' | 'wakeAt'>;
  claim: RunClaim;
  step: SendStep;
  checkPhone: () => Promise<boolean>;
};

export async function authorizeFirstSubmission({
  transaction,
  repository,
  facts: { storeId, wakeAt },
  claim,
  step,
  checkPhone,
}: FirstSubmissionInput): Promise<RunClaim> {
  return transaction.run(storeId, async () => {
    const held = await repository.moveRun(storeId, claim, {
      status: 'running',
      claimedAt: claim.claimedAt,
    });
    if (!held) throw new WorkflowSubmissionStopped(undefined);
    const phoneMatches = await checkPhone();
    const now = await repository.schedulerTime(storeId);
    const outcome = firstSubmissionStop({ phoneMatches, claim, step, wakeAt, now });
    if (outcome) throw new WorkflowSubmissionStopped(outcome);
    await repository.moveRun(storeId, claim, { status: 'running', claimedAt: now });
    return { ...claim, claimedAt: now };
  });
}

function firstSubmissionStop({
  phoneMatches,
  claim,
  step,
  wakeAt,
  now,
}: {
  phoneMatches: boolean;
  claim: RunClaim;
  step: SendStep;
  wakeAt: Date | null;
  now: Date;
}): StepResult | undefined {
  const credits = { settle: 'release' } as const;
  if (isLateSend(wakeAt, now))
    return { ...goOn(step.next, now), claim, stepChange: { outcome: 'late' }, credits };
  const reason = phoneMatches
    ? 'The worker lease expired before submitting the SMS'
    : "The contact's phone changed after this message was decided";
  if (phoneMatches && now.getTime() - claim.claimedAt.getTime() < WORKFLOW_LEASE_MS)
    return undefined;
  return { ...failed(reason, now), claim, stepChange: { outcome: 'failed' }, credits };
}
