import { createHash } from 'node:crypto';

import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';

import type { ContactsService } from '../contacts/contacts.service';
import type { SendDecision } from '../sending/send-policy.service';
import type {
  ClaimedRun,
  NewRunStep,
  RunChange,
  RunClaim,
  RunStepChange,
} from './automation-runs.repository';

// Step jobs that started on a claim and committed nothing: a job that keeps failing.
const MAX_CLAIMS_WITHOUT_PROGRESS = 10;

export type SendStep = Extract<AutomationStep, { kind: 'send' }>;
export type Condition = AutomationGraph['workflowFilters'][number];
type ExitCondition = AutomationGraph['exitConditions'][number];
// What the person has done in this run so far, read once per step.
export type RunFacts = {
  storeId: string;
  runId: string;
  contactId: string;
  tags: string[];
  tappedStepKeys: string[];
  wakeAt: Date | null;
};
export type PathChoice = { outcome: string; next: string };
export type Delivery = {
  storeId: string;
  claim: RunClaim;
  contactId: string;
  step: SendStep;
  body: string;
  isFirstTry: boolean;
};
// What the gate's transaction decided: a renewal refused for a paused, stopped or archived
// workflow or a lost claim, a skip or defer, or a send with its text.
export type GateResult =
  'not_live' | { decision: SendDecision } | { decision: { action: 'send' }; body: string };
export type CreditSettlement = { settle: 'charge'; quantity: number } | { settle: 'release' };
// The run's next state, the step row to add or change, a tag change and the send's credits,
// written together under the claim (a send renews it first), and the next step's claim when the
// run goes straight on.
export type StepResult = {
  run: RunChange;
  credits?: CreditSettlement;
  claim?: RunClaim;
  step?: NewRunStep;
  stepChange?: RunStepChange;
  tagChange?: Parameters<ContactsService['changeTag']>[2];
  next?: Omit<RunClaim, 'runId'>;
};

// Tasks for staff, team notices, handing to a person and coupons have no owning service yet, and
// publish refuses them. The tag change is written with the step, under the claim.
export function runAction(
  stepKey: string,
  { action, next }: Extract<AutomationStep, { kind: 'action' }>,
  now: Date,
): StepResult {
  if (action.action !== 'add_tag' && action.action !== 'remove_tag')
    return failed('This action is not available yet', now);
  const change = action.action === 'add_tag' ? 'add' : 'remove';
  return {
    ...goOn(next, now),
    step: { stepKey, kind: 'action', outcome: 'done' },
    tagChange: { tag: action.tag, change },
  };
}

// Orders arrive with ORD-1 and replies with CHAT-2, so those exits cannot happen yet; publish
// refuses the tap exit until taps on workflow messages are recorded. Tags carry no time, so a tag
// the person already had counts as got.
export function hasHappened(exit: ExitCondition, facts: RunFacts): boolean {
  if (exit.kind === 'got_tag') return facts.tags.includes(exit.tag);
  if (exit.kind === 'tapped_link') return facts.tappedStepKeys.length > 0;
  return false;
}

// Short balance (feature 09): the step is skipped as no_credits and "if not reachable" applies.
// Pausing the workflow or failing the run instead would change only this case.
export const noCredits = { action: 'skip', reason: 'no_credits' } as const;

export function operationKey({ runId, stepKey }: RunClaim) {
  return `run:${runId}:${stepKey}`;
}

export function messageBody(step: SendStep, optOutUrl: string | undefined): string {
  return optOutUrl ? `${step.message.text}\n${optOutUrl}` : step.message.text;
}

export function ifNotReachable(step: SendStep, now: Date) {
  return step.ifNotReachable === 'skip' ? goOn(step.next, now) : exited('not_reachable', now);
}

// The step was handed to the provider and no answer came; it may have been sent. Its credits stay
// reserved until a reconciliation settles it (ACC-14 brings provider status reports).
export const UNKNOWN_OUTCOME =
  'The SMS provider did not confirm this message, so its credits stay reserved until it is checked';

export function endWithUnknownOutcome(held: StepResult): StepResult {
  if (held.run.status === 'waiting') return held;
  return {
    ...held,
    run: {
      ...held.run,
      lastError: held.run.lastError ? `${held.run.lastError}. ${UNKNOWN_OUTCOME}` : UNKNOWN_OUTCOME,
    },
    stepChange: { outcome: 'failed' },
  };
}

// Checked before every step.
export function holdOrEnd(run: ClaimedRun, now: Date): StepResult | undefined {
  if (run.attempts > MAX_CLAIMS_WITHOUT_PROGRESS)
    return failed('This step failed too many times in a row', now);
  // Pausing holds everyone where they are; the sweep skips the run until the workflow is enabled.
  if (run.automationStatus === 'paused')
    return { run: { status: 'waiting', wakeAt: run.wakeAt ?? now } };
  // "Stop the old version" and archiving both remove everyone still inside at their next step.
  if (run.isVersionStopped) return exited('version_stopped', now);
  if (run.automationStatus === 'archived') return exited('archived', now);
  return undefined;
}

export function holdsClaim(run: ClaimedRun, claim: RunClaim): boolean {
  return (
    run.status === 'running' &&
    run.currentStepKey === claim.stepKey &&
    run.claimedAt?.getTime() === claim.claimedAt.getTime()
  );
}

// The next step's job takes over the claim with a fresh time, which also renews the lease.
export function goOn(next: string, now: Date) {
  return {
    run: { status: 'running', currentStepKey: next, claimedAt: now },
    next: { stepKey: next, claimedAt: now },
  } as const;
}

export function exited(exitReason: string, now: Date) {
  return { run: { status: 'exited', exitReason, finishedAt: now } } as const;
}

export function failed(reason: string, now: Date) {
  return { run: { status: 'failed', lastError: reason, finishedAt: now } } as const;
}

// A hash of the run and the step, so a retry takes the same path and two splits are independent.
// The graph schema makes the percents add up to 100, so the last path takes the rest.
export function randomPath(
  runId: string,
  stepKey: string,
  paths: { percent: number; next: string }[],
) {
  const bucket = createHash('sha256').update(`${runId}:${stepKey}`).digest().readUInt32BE(0) % 100;
  let upTo = 0;
  const index = paths.findIndex((path) => (upTo += path.percent) > bucket);
  return { outcome: `path_${index + 1}`, next: paths[index]!.next };
}
