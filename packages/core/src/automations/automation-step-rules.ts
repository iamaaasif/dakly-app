import { createHash } from 'node:crypto';

import type { AutomationExitReason } from '@dakly/contracts/automations';
import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';

import type { ContactsService } from '../contacts/contacts.service';
import type { ClaimedRun, NewRunStep, RunChange, RunClaim } from './automation-runs.repository';
import { wakeTime } from './automation-waits';

// Step jobs that started on a claim and committed nothing: a job that keeps failing.
const MAX_CLAIMS_WITHOUT_PROGRESS = 10;

// What the person has done in this run so far, read once per step.
export type RunFacts = {
  storeId: string;
  runId: string;
  contactId: string;
  tags: string[];
  tappedStepKeys: string[];
};
// The run's next state, the step row and a tag change, written together under the claim, and the
// next step's claim when the run goes straight on.
export type StepResult = {
  run: RunChange;
  step?: NewRunStep;
  tagChange?: Parameters<ContactsService['changeTag']>[2];
  next?: Omit<RunClaim, 'runId'>;
};

type ExitCondition = AutomationGraph['exitConditions'][number];

export function scheduleWait(
  stepKey: string,
  step: Extract<AutomationStep, { kind: 'wait' }>,
  now: Date,
  timeZone: string,
): StepResult {
  return {
    run: {
      status: 'waiting',
      currentStepKey: step.next,
      wakeAt: wakeTime(step.wait, now, timeZone),
    },
    step: { stepKey, kind: 'wait', outcome: 'scheduled' },
  };
}

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

export function exited(exitReason: AutomationExitReason, now: Date) {
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
