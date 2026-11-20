import { createHash } from 'node:crypto';

import type { AutomationExitReason } from '@dakly/contracts/automations';
import type { AutomationGraph, AutomationStep } from '@dakly/contracts/automations/graph';

import type { TagChange } from '../contacts/contacts.service';
import type { PreparedSmsSender } from '../messaging/messaging.service';
import { loadEnv } from '../platform/config/env';
import { hashCode } from '../platform/crypto/code-hash';
import { DAY_MS, MINUTE_MS } from '../platform/time';
import type { SendDecision } from '../sending/send-policy.service';
import type {
  ClaimedRun,
  NewRunStep,
  RunChange,
  RunClaim,
  RunStepChange,
} from './automation-runs.repository';
import { wakeTime } from './automation-waits';

// Step jobs that started on a claim and committed nothing: a job that keeps failing.
const MAX_CLAIMS_WITHOUT_PROGRESS = 10;

// Matches the lease compared by due_automation_runs in Postgres.
export const WORKFLOW_LEASE_MS = 5 * MINUTE_MS;

export type Condition = AutomationGraph['workflowFilters'][number];
export type PathChoice = { outcome: string; next: string };

export type SendStep = Extract<AutomationStep, { kind: 'send' }>;
// What the person has done in this run so far, read once per step.
export type RunFacts = {
  preparedSender?: PreparedSmsSender;
  graph: AutomationGraph;
  automationId: string;
  storeId: string;
  runId: string;
  contactId: string;
  tags: string[];
  tappedStepKeys: string[];
  wakeAt: Date | null;
  orderId: string | null;
};
// A Messenger send is routed to the Page where the contact wrote last; its buttons name the step
// row so a tap can be matched to it.
export type MessengerSend = { connectionId: string; identityId: string; stepId: string };
// Meta's window is 24 hours from the contact's last message; the hour is the margin for the gap
// before Meta accepts the send (D24), the same as for campaigns.
export const MESSENGER_WINDOW_MS = 23 * 60 * 60 * 1000;
export type Delivery = {
  preparedSender?: PreparedSmsSender;
  storeId: string;
  claim: RunClaim;
  contactId: string;
  orderId: string | null;
  step: SendStep;
  body: string;
  destination: string | null;
};
// What the gate's transaction decided: a renewal refused for a paused, stopped or archived
// workflow or a lost claim, a skip or defer, or a send with its text.
export type GateResult =
  | 'not_live'
  | 'balance_paused'
  | { outcome: 'late'; balanceResumedAt: Date | null }
  | { outcome: 'destination_changed' }
  | { exitReason: AutomationExitReason; at: Date }
  | { decision: Exclude<SendDecision, { action: 'send' }> }
  | {
      decision: { action: 'send' };
      body: string;
      destination: string | null;
      at: Date;
      firstTriedAt: Date;
      messenger?: MessengerSend;
    };
export function holdOwnedClaim(run: ClaimedRun | undefined, claim: RunClaim, now: Date) {
  return run && holdsClaim(run, claim) ? holdOrEnd(run, now) : undefined;
}

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
  tagChange?: TagChange;
  next?: Omit<RunClaim, 'runId'>;
};

type ExitCondition = AutomationGraph['exitConditions'][number];

export function operationKey({ runId, stepKey }: RunClaim) {
  return `run:${runId}:${stepKey}`;
}

// A send due more than a day before it runs is skipped (feature 09): as no_credits when it was
// already a day old at the top-up that ended a pause for balance, else as late, as after a manual
// pause that held it longer.
function lateSend(
  step: SendStep,
  stepKey: string,
  { wakeAt, balanceResumedAt }: { wakeAt: Date | null; balanceResumedAt: Date | null },
  now: Date,
): StepResult {
  const row = { stepKey, kind: 'send', category: step.category } as const;
  // Held through a balance pause and already a day old when the top-up ended it.
  if (balanceResumedAt && wakeAt && balanceResumedAt.getTime() - wakeAt.getTime() > DAY_MS)
    return {
      ...ifNotReachable(step, now),
      step: { ...row, outcome: 'skipped', skipReason: 'no_credits' },
    };
  return { ...goOn(step.next, now), step: { ...row, outcome: 'late' } };
}

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

export function firstSendStop(
  claim: RunClaim,
  step: SendStep,
  started: Exclude<GateResult, 'not_live' | 'balance_paused' | { body: string }>,
  wakeAt: Date | null,
): StepResult {
  const at = claim.claimedAt;
  const row = { stepKey: claim.stepKey, kind: 'send', category: step.category } as const;
  if ('exitReason' in started) return { ...exited(started.exitReason, at), claim };
  if ('outcome' in started) {
    if (started.outcome === 'late')
      return { ...lateSend(step, claim.stepKey, { ...started, wakeAt }, at), claim };
    return {
      ...failed("The contact's phone changed during SMS preparation", at),
      claim,
      step: { ...row, outcome: 'failed' },
    };
  }
  const { decision } = started;
  if (decision.action === 'defer')
    return { claim, run: { status: 'waiting', wakeAt: decision.until } };
  return {
    ...ifNotReachable(step, at),
    claim,
    step: { ...row, outcome: 'skipped', skipReason: decision.reason },
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

// Order confirmed and cancelled read the order that started the run. Paid and replies are not
// built yet, so those exits cannot happen; publish
// refuses the tap exit until taps on workflow messages are recorded. Tags carry no time, so a tag
// the person already had counts as got.
export type OrderProgress = {
  isConfirmed: boolean;
  isCancelled: boolean;
  isAwaitingConfirmation: boolean;
};

export function hasHappened(exit: ExitCondition, facts: RunFacts, order?: OrderProgress): boolean {
  if (exit.kind === 'order_confirmed') return !!order?.isConfirmed;
  if (exit.kind === 'order_cancelled') return !!order?.isCancelled;
  if (exit.kind === 'got_tag') return facts.tags.includes(exit.tag);
  if (exit.kind === 'tapped_link') return facts.tappedStepKeys.length > 0;
  return false;
}

export function messageBody(text: string, optOutUrl: string | undefined): string {
  return optOutUrl ? `${text}\n${optOutUrl}` : text;
}

export function workflowDestinationHash(storeId: string, phone: string | null): string | null {
  return phone
    ? hashCode(loadEnv().CODE_HASH_KEY, JSON.stringify(['workflow-sms', storeId, phone]))
    : null;
}

export function ifNotReachable(step: SendStep, now: Date) {
  return step.ifNotReachable === 'skip' ? goOn(step.next, now) : exited('not_reachable', now);
}

// The step was handed to the provider and no answer came; it may have been sent. Its credits stay
// reserved until a reconciliation settles it (ACC-14 brings provider status reports), and it is
// not sent again.
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
    stepChange: { outcome: 'unconfirmed' },
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
    run: { status: 'running', currentStepKey: next, claimedAt: now, wakeAt: now },
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

export function isLateSend(wakeAt: Date | null, now: Date): boolean {
  return wakeAt !== null && now.getTime() - wakeAt.getTime() > DAY_MS;
}

export function sendLateness(
  wakeAt: Date | null,
  now: Date,
  run: Pick<ClaimedRun, 'balanceResumedAt' | 'hasBalanceResumeSendAllowance'> | undefined,
) {
  if (!isLateSend(wakeAt, now)) return undefined;
  const balanceResumedAt = run?.balanceResumedAt ?? null;
  // If a top-up made an already-due send eligible, the wait for the sweep cannot expire it.
  if (
    run?.hasBalanceResumeSendAllowance &&
    balanceResumedAt &&
    wakeAt &&
    wakeAt <= balanceResumedAt &&
    !isLateSend(wakeAt, balanceResumedAt)
  )
    return undefined;
  return { outcome: 'late', balanceResumedAt } as const;
}

export function shouldPrepareSender(step: AutomationStep): boolean {
  return step.kind === 'send' && step.channels.includes('sms') && !step.reviewBeforeSending;
}
