import type { AutomationExitReason } from '@dakly/contracts/automations';

import { TRACKED_LINK_CODE_LENGTH } from '../links/links.service';
import type { StoreTransaction } from '../platform/database/store-transaction';
import { HOUR_MS, MINUTE_MS } from '../platform/time';
import type { SendDecision, SendPolicyService } from '../sending/send-policy.service';
import type { StoreSendingSettings, StoresService } from '../stores/stores.service';
import type { AutomationRunsRepository, RunClaim, SendingStep } from './automation-runs.repository';
import {
  endWithUnknownOutcome,
  exited,
  failed,
  goOn,
  ifNotReachable,
  isLateSend,
  type RunFacts,
  type SendStep,
  type StepResult,
  UNKNOWN_OUTCOME,
  workflowDestinationHash,
  WORKFLOW_LEASE_MS,
} from './automation-step-rules';

const RETRY_LIMIT_MS = 36 * HOUR_MS;
const MAX_DELAY_MS = 6 * HOUR_MS;
const optOutPath = new RegExp(`/s/[a-zA-Z0-9]{${TRACKED_LINK_CODE_LENGTH}}$`, 'u');

type RetryableSend = SendingStep & {
  firstTriedAt: Date;
  latestDispatchAt: Date;
  destinationHash: string;
};

type RetryGateDecision =
  { result: StepResult; at: Date } | { result: undefined; at: Date; destination: string };
type RetryCheck = (now: Date) => RetryGateDecision;

export function hasRetryDetails(step: SendStep, row: SendingStep, now: Date): row is RetryableSend {
  return (
    row.providerMessageId === null &&
    validTime(row.firstTriedAt) &&
    row.firstTriedAt <= now &&
    validTime(row.latestDispatchAt) &&
    /^[a-f0-9]{64}$/u.test(row.destinationHash ?? '') &&
    (step.category === 'marketing' ? validOptOutUrl(row.optOutUrl) : row.optOutUrl === null)
  );
}

function validTime(time: Date | null): time is Date {
  return time instanceof Date && Number.isFinite(time.getTime());
}

function validOptOutUrl(value: string | null): boolean {
  if (!value || /\s/u.test(value)) return false;
  const url = URL.parse(value);
  return (
    url !== null &&
    /^https?:$/u.test(url.protocol) &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    optOutPath.test(url.pathname)
  );
}

export function endIncompleteRetry(now: Date): StepResult {
  return endWithUnknownOutcome(failed('The SMS is missing its original delivery details', now));
}

function exhausted(firstTriedAt: Date, now: Date): StepResult | undefined {
  if (now.getTime() - firstTriedAt.getTime() < RETRY_LIMIT_MS) return undefined;
  return endWithUnknownOutcome(failed('The SMS provider did not answer for 36 hours', now));
}

export function endExpiredRetry(
  step: SendStep,
  firstTriedAt: Date,
  wakeAt: Date | null,
  now: Date,
) {
  if (now < firstTriedAt) return endIncompleteRetry(now);
  return (
    exhausted(firstTriedAt, now) ??
    (isLateSend(wakeAt, now) ? endWithUnknownOutcome(goOn(step.next, now)) : undefined)
  );
}

type RetryDispatchInput = {
  repository: AutomationRunsRepository;
  transaction: StoreTransaction;
  stores: Pick<StoresService, 'sendingSettings'>;
  claim: RunClaim;
  step: SendStep;
  facts: Pick<RunFacts, 'storeId' | 'wakeAt'>;
  recheck: (
    locked: RetryableSend,
    settings: StoreSendingSettings | undefined,
  ) => Promise<RetryCheck>;
};

// Recheck the destination under the contact lock and renew after waiting for the workflow lock.
export async function claimRetryDispatch({
  repository,
  transaction,
  stores,
  claim,
  step,
  facts: { storeId, wakeAt },
  recheck,
}: RetryDispatchInput) {
  return transaction.run(storeId, async () => {
    // Keep the marketing settings stable through the retry dispatch commit.
    const settings =
      step.category === 'marketing' ? await stores.sendingSettings(storeId, 'share') : undefined;
    const unchanged = { status: 'running', claimedAt: claim.claimedAt } as const;
    if (!(await repository.moveRunIfLive(storeId, claim, unchanged))) return undefined;
    if (!(await repository.moveRunIfLive(storeId, claim, unchanged, 'dispatch'))) return undefined;
    const locked = await repository.findSendingStep(storeId, claim.runId, claim.stepKey, true);
    if (!locked) return undefined;
    const checkedAt = await repository.schedulerTime(storeId);
    const finishWithoutSubmission = async (resultAt: (at: Date) => StepResult) => {
      const claimedAt = await repository.schedulerTime(storeId);
      await repository.moveRun(storeId, claim, { status: 'running', claimedAt });
      return { result: resultAt(claimedAt), claim: { ...claim, claimedAt }, at: claimedAt };
    };
    if (!hasRetryDetails(step, locked, checkedAt))
      return finishWithoutSubmission(endIncompleteRetry);
    const { firstTriedAt, latestDispatchAt } = locked;
    const early = endExpiredRetry(step, firstTriedAt, wakeAt, checkedAt);
    if (early) return finishWithoutSubmission(() => early);
    const finalize = await recheck(locked, settings);
    const claimedAt = await repository.schedulerTime(storeId);
    const checked = finalize(claimedAt);
    const ended = endExpiredRetry(step, firstTriedAt, wakeAt, claimedAt);
    const result = retryOutcome(checked.result, ended);
    const leaseRecovery = retryAfterLostLease(claim, claimedAt, result, wakeAt);
    if (leaseRecovery) return { result: leaseRecovery, claim, at: checked.at };
    // A slower worker must not age out a previously submitted message early.
    const sentAt = new Date(Math.max(checked.at.getTime(), latestDispatchAt.getTime()));
    const dispatch = { outcome: 'sending', sentAt, firstTriedAt } as const;
    if (!result) await repository.changeStep(storeId, claim.runId, claim.stepKey, dispatch);
    await repository.moveRun(storeId, claim, { status: 'running', claimedAt });
    const renewed = { ...claim, claimedAt };
    if (result) return { result, claim: renewed, at: checked.at };
    return {
      ...checked,
      claim: renewed,
      at: sentAt,
      previousDispatchAt: latestDispatchAt,
      firstTriedAt,
    };
  });
}

function retryAfterLostLease(
  claim: RunClaim,
  now: Date,
  result: StepResult | undefined,
  wakeAt: Date | null,
): StepResult | undefined {
  if (result && result.run.status !== 'waiting') return undefined;
  if (now.getTime() - claim.claimedAt.getTime() < WORKFLOW_LEASE_MS) return undefined;
  return { run: { status: 'waiting', wakeAt: wakeAt ?? now } };
}

function retryOutcome(result: StepResult | undefined, ended: StepResult | undefined) {
  // A defer must not overwrite a wake time that already exceeded a hard cutoff.
  return result?.run.status === 'waiting' ? (ended ?? result) : (result ?? ended);
}

type RetryCheckInput = {
  sendPolicy: SendPolicyService;
  readPhone: () => Promise<string | null>;
  preparedPhone: string | null;
  readExit: (at: Date) => Promise<AutomationExitReason | undefined>;
  schedulerTime: () => Promise<Date>;
  facts: Pick<RunFacts, 'storeId' | 'contactId' | 'wakeAt'>;
  step: SendStep;
  settings: StoreSendingSettings | undefined;
  locked: RetryableSend;
};

export async function recheckAutomationRetry({
  sendPolicy,
  readPhone,
  preparedPhone,
  readExit,
  schedulerTime,
  facts: { storeId, contactId, wakeAt },
  step,
  settings,
  locked: { id, firstTriedAt, destinationHash },
}: RetryCheckInput): Promise<RetryCheck> {
  const gate = await sendPolicy.recheckRetryRecipient(storeId, {
    contactId,
    channel: 'sms',
    category: step.category,
  });
  const { decision, at } = gate;
  const exit = await readExit(at);
  const now = await schedulerTime();
  const result = exit
    ? endWithUnknownOutcome(exited(exit, now))
    : (endExpiredRetry(step, firstTriedAt, wakeAt, now) ??
      retryDecision(step, firstTriedAt, decision, now));
  if (result) return () => ({ result, at });
  const destination = await readPhone();
  if (
    !destination ||
    destination !== preparedPhone ||
    workflowDestinationHash(storeId, destination) !== destinationHash
  )
    return () => ({
      result: endWithUnknownOutcome(
        failed("The contact's phone changed after this message was decided", now),
      ),
      at,
    });
  if (!settings) return () => ({ result: undefined, at, destination });
  const check = await sendPolicy.prepareMarketingRetryCheck(storeId, {
    contactId,
    workflowStepId: id,
    settings,
  });
  return (checkedAt) => {
    const final = check();
    const held = retryDecision(step, firstTriedAt, final.decision, checkedAt);
    return held ? { result: held, at: final.at } : { result: undefined, at: final.at, destination };
  };
}

function retryDecision(
  step: SendStep,
  firstTriedAt: Date,
  decision: SendDecision,
  now: Date,
): StepResult | undefined {
  if (decision.action === 'defer')
    return { run: { status: 'waiting', wakeAt: retryWakeAt(firstTriedAt, decision.until) } };
  if (decision.action === 'skip') {
    const result = ifNotReachable(step, now);
    return {
      ...result,
      run: { ...result.run, lastError: UNKNOWN_OUTCOME },
      stepChange: { outcome: 'unconfirmed', skipReason: decision.reason },
    };
  }
  return undefined;
}

export function retryAfterError(claim: RunClaim, firstTriedAt: Date, now: Date): StepResult {
  const end = exhausted(firstTriedAt, now);
  if (end) return { ...end, claim };
  // The wait doubles with time already spent, from one minute up to six hours.
  const elapsed = now.getTime() - firstTriedAt.getTime();
  const delay = Math.min(Math.max(elapsed, MINUTE_MS), MAX_DELAY_MS);
  return {
    claim,
    run: {
      status: 'waiting',
      wakeAt: retryWakeAt(firstTriedAt, new Date(now.getTime() + delay)),
      lastError: 'The SMS provider did not answer; trying again',
    },
  };
}

function retryWakeAt(firstTriedAt: Date, candidate: Date) {
  const deadline = firstTriedAt.getTime() + RETRY_LIMIT_MS;
  return new Date(Math.min(candidate.getTime(), deadline));
}
