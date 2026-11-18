import type { MessagingService } from '../messaging/messaging.service';
import type { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import type { ErrorReporter } from '../platform/logging/error-reporter';
import { serializeError } from '../platform/logging/safe-error';
import { HOUR_MS, MINUTE_MS } from '../platform/time';
import type { SendDecision } from '../sending/send-policy.service';
import type { RunClaim } from './automation-runs.repository';
import {
  type Delivery,
  endWithUnknownOutcome,
  failed,
  goOn,
  ifNotReachable,
  isLateSend,
  operationKey,
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
    transaction,
  }: { messaging: MessagingService; reporter: ErrorReporter; transaction: StoreTransaction },
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
  const now = await transaction.databaseTime(storeId);
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
