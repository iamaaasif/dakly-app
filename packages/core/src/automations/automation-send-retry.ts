import type { MessagingService } from '../messaging/messaging.service';
import type { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import type { ErrorReporter } from '../platform/logging/error-reporter';
import { serializeError } from '../platform/logging/safe-error';
import { HOUR_MS, MINUTE_MS } from '../platform/time';
import type { SendDecision } from '../sending/send-policy.service';
import type { WalletService } from '../wallets/wallet.service';
import type { AutomationRunsRepository, RunClaim, SendingStep } from './automation-runs.repository';
import {
  type CreditSettlement,
  type Delivery,
  endWithUnknownOutcome,
  failed,
  goOn,
  ifNotReachable,
  isLateSend,
  operationKey,
  type RunFacts,
  type SendStep,
  type StepResult,
  UNKNOWN_OUTCOME,
} from './automation-step-rules';

const RETRY_LIMIT_MS = 36 * HOUR_MS;
const MAX_DELAY_MS = 6 * HOUR_MS;

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
  return (
    exhausted(firstTriedAt, now) ??
    (isLateSend(wakeAt, now) ? endWithUnknownOutcome(goOn(step.next, now)) : undefined)
  );
}

// Lock the contact through the resend checks before taking the workflow lock for dispatch.
export async function claimRetryDispatch({
  repository,
  transaction,
  claim,
  step,
  facts: { storeId, wakeAt },
  recheck,
}: {
  repository: AutomationRunsRepository;
  transaction: StoreTransaction;
  claim: RunClaim;
  step: SendStep;
  facts: Pick<RunFacts, 'storeId' | 'wakeAt'>;
  recheck: (
    locked: SendingStep,
    lockWorkflow: () => Promise<boolean>,
  ) => Promise<{ result: StepResult | undefined; at: Date } | undefined>;
}) {
  return transaction.run(storeId, async () => {
    const unchanged = { status: 'running', claimedAt: claim.claimedAt } as const;
    if (!(await repository.moveRunIfLive(storeId, claim, unchanged))) return undefined;
    const locked = await repository.findSendingStep(storeId, claim.runId, claim.stepKey, true);
    if (!locked) return undefined;
    const checkedAt = await repository.schedulerTime(storeId);
    const { firstTriedAt } = locked;
    const early = endExpiredRetry(step, firstTriedAt, wakeAt, checkedAt);
    const lockWorkflow = () => repository.moveRunIfLive(storeId, claim, unchanged, 'retry');
    const checked = early
      ? (await lockWorkflow()) && { result: early, at: checkedAt }
      : await recheck(locked, lockWorkflow);
    if (!checked) return undefined;
    const { result, at } = checked;
    // A slower worker must not age out a previously submitted message early.
    const sentAt = at > locked.latestDispatchAt ? at : locked.latestDispatchAt;
    const dispatch = { outcome: 'sending', sentAt, firstTriedAt } as const;
    if (!result) await repository.changeStep(storeId, claim.runId, claim.stepKey, dispatch);
    const claimedAt = await repository.schedulerTime(storeId);
    await repository.moveRun(storeId, claim, { status: 'running', claimedAt });
    return { result, claim: { ...claim, claimedAt }, at: sentAt };
  });
}

export function retryDecision(
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

function refusedSend(claim: RunClaim, message: string, isFirstTry: boolean, now: Date): StepResult {
  const result = failed(message, now);
  // A refusal proves this attempt did not send. An earlier attempt could still have succeeded.
  if (!isFirstTry) return endWithUnknownOutcome({ ...result, claim });
  return { ...result, claim, stepChange: { outcome: 'failed' }, credits: { settle: 'release' } };
}

function retryAfterError(claim: RunClaim, firstTriedAt: Date, now: Date): StepResult {
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

// The provider call runs outside the transaction. The operation key deduplicates retry attempts.
export async function deliverAutomationSms(
  {
    messaging,
    reporter,
    repository,
  }: {
    messaging: MessagingService;
    reporter: ErrorReporter;
    repository: Pick<AutomationRunsRepository, 'schedulerTime'>;
  },
  { storeId, claim, contactId, step, body, destination, isFirstTry, preparedSender }: Delivery,
  firstTriedAt: Date,
  attemptedAt: Date,
): Promise<StepResult> {
  const message = {
    channel: 'sms',
    contactId,
    body,
    operationKey: operationKey(claim),
    destination,
  } as const;
  const attempt = await messaging.send(storeId, message, preparedSender).then(
    (receipt) => ({ receipt }),
    (error: unknown) => ({ error }),
  );
  const now = await repository.schedulerTime(storeId);
  if ('receipt' in attempt) {
    const { providerMessageId, credits } = attempt.receipt;
    return {
      ...goOn(step.next, now),
      claim,
      stepChange: { outcome: 'sent', providerMessageId, sentAt: attemptedAt },
      credits: { settle: 'charge', quantity: credits },
    };
  }
  const { error } = attempt;
  if (error instanceof AppError) return refusedSend(claim, error.message, isFirstTry, now);
  const result = retryAfterError(claim, firstTriedAt, now);
  if (result.run.status === 'waiting')
    reporter.reportJob(serializeError(error), operationKey(claim));
  return result;
}

export async function settleAutomationCredits(
  wallets: WalletService,
  storeId: string,
  claim: RunClaim,
  credits: CreditSettlement,
) {
  const key = operationKey(claim);
  // Every send row was written with its reservation, in the same transaction.
  const reservationId = (await wallets.findByIdempotencyKey(storeId, key))!.entryId;
  if (credits.settle === 'charge')
    await wallets.charge(storeId, {
      reservationId,
      quantity: credits.quantity,
      idempotencyKey: `${key}:charge`,
      actor: { kind: 'system' },
    });
  else
    await wallets.release(storeId, {
      reservationId,
      idempotencyKey: `${key}:release`,
      actor: { kind: 'system' },
    });
}
