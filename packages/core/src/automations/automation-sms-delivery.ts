import type { MessagingService, PreparedSms } from '../messaging/messaging.service';
import { AppError } from '../platform/errors/app-error';
import type { ErrorReporter } from '../platform/logging/error-reporter';
import { jobLogBindings } from '../platform/logging/job-context';
import { serializeError } from '../platform/logging/safe-error';
import type { WalletService } from '../wallets/wallet.service';
import type { AutomationRunsRepository, RunClaim } from './automation-runs.repository';
import {
  type CreditSettlement,
  endWithUnknownOutcome,
  failed,
  goOn,
  operationKey,
  type RunFacts,
  type SendStep,
  type StepResult,
  workflowOperationHash,
} from './automation-step-rules';

export const SMS_NO_ANSWER = 'The SMS provider did not answer';

const system = { kind: 'system' } as const;

export type AuthorizedSubmission = {
  claim: RunClaim;
  at: Date;
  body: string;
};

export async function prepareAutomationSms(
  messaging: MessagingService,
  {
    storeId,
    contactId,
    preparedSender,
  }: Pick<RunFacts, 'storeId' | 'contactId' | 'preparedSender'>,
) {
  try {
    return await messaging.prepareSms(storeId, contactId, preparedSender);
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== 'CONTACT_NOT_FOUND') throw error;
    return undefined;
  }
}

type SmsDeliveryServices = {
  messaging: MessagingService;
  reporter: ErrorReporter;
  repository: Pick<AutomationRunsRepository, 'schedulerTime'>;
};

// The provider call runs outside the transaction.
export async function deliverAutomationSms(
  { messaging, reporter, repository }: SmsDeliveryServices,
  { storeId, contactId, step }: { storeId: string; contactId: string; step: SendStep },
  prepared: PreparedSms,
  submitted: AuthorizedSubmission,
): Promise<StepResult> {
  const key = operationKey(submitted.claim);
  const attempt = await messaging
    .send(storeId, { channel: 'sms', contactId, body: submitted.body, operationKey: key }, prepared)
    .then(
      (receipt) => ({ receipt }),
      (error: unknown) => ({ error }),
    );
  const refusal =
    'error' in attempt &&
    attempt.error instanceof AppError &&
    attempt.error.code === 'SMS_SEND_REFUSED'
      ? attempt.error
      : undefined;
  if ('error' in attempt && !refusal)
    reporter.reportJob(
      serializeError(attempt.error),
      jobLogBindings().jobId,
      workflowOperationHash(storeId, key),
    );
  const now = await repository.schedulerTime(storeId);
  if ('receipt' in attempt) return acceptedSend(step, submitted, attempt.receipt, now);
  if (refusal)
    return {
      ...failed(refusal.message, now),
      claim: submitted.claim,
      stepChange: { outcome: 'failed' },
      credits: { settle: 'release' },
    };
  return endWithUnknownOutcome({ ...failed(SMS_NO_ANSWER, now), claim: submitted.claim });
}

function acceptedSend(
  step: SendStep,
  { claim, at }: AuthorizedSubmission,
  { providerMessageId, credits }: { providerMessageId: string; credits: number },
  now: Date,
): StepResult {
  return {
    ...goOn(step.next, now),
    claim,
    stepChange: { outcome: 'sent', providerMessageId, sentAt: at },
    credits: { settle: 'charge', quantity: credits },
  };
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
      actor: system,
    });
  else
    await wallets.release(storeId, {
      reservationId,
      idempotencyKey: `${key}:release`,
      actor: system,
    });
}
