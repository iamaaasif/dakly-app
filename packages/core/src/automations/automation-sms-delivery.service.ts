import { Inject, Injectable } from '@nestjs/common';

import { MessagingService, type PreparedSms } from '../messaging/messaging.service';
import { AppError } from '../platform/errors/app-error';
import { ErrorReporter } from '../platform/logging/error-reporter';
import { jobLogBindings } from '../platform/logging/job-context';
import { serializeError } from '../platform/logging/safe-error';
import { WalletService } from '../wallets/wallet.service';
import { AutomationRunsRepository, type RunClaim } from './automation-runs.repository';
import { retryAfterError } from './automation-send-retry.service';
import {
  type CreditSettlement,
  endWithUnknownOutcome,
  failed,
  goOn,
  operationKey,
  type RunFacts,
  type SendStep,
  type StepResult,
} from './automation-step-rules';

const system = { kind: 'system' } as const;

type AuthorizedSubmission = {
  claim: RunClaim;
  at: Date;
  firstTriedAt: Date;
  previousDispatchAt?: Date;
  body: string;
};

@Injectable()
export class AutomationSmsDeliveryService {
  constructor(
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Inject(WalletService) private readonly wallets: WalletService,
    @Inject(ErrorReporter) private readonly reporter: ErrorReporter,
    @Inject(AutomationRunsRepository) private readonly repository: AutomationRunsRepository,
  ) {}

  async prepare({
    storeId,
    contactId,
    preparedSender,
  }: Pick<RunFacts, 'storeId' | 'contactId' | 'preparedSender'>) {
    try {
      return await this.messaging.prepareSms(storeId, contactId, preparedSender);
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'CONTACT_NOT_FOUND') throw error;
      return undefined;
    }
  }

  // The caller commits authorization before this method calls the provider.
  async deliver(
    { storeId, contactId, step }: { storeId: string; contactId: string; step: SendStep },
    prepared: PreparedSms,
    { claim, at, firstTriedAt, previousDispatchAt, body }: AuthorizedSubmission,
  ): Promise<StepResult> {
    const attempt = await this.messaging
      .send(
        storeId,
        { channel: 'sms', contactId, body, operationKey: operationKey(claim) },
        prepared,
      )
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
    if ('error' in attempt && !refusal) {
      const { jobId } = jobLogBindings();
      if (!jobId) throw new Error('Workflow SMS reporting requires a worker job ID');
      const { runId, stepKey } = claim;
      this.reporter.reportJob(serializeError(attempt.error), jobId, { runId, stepKey });
    }
    const now = await this.repository.schedulerTime(storeId);
    if ('receipt' in attempt) {
      const { providerMessageId, credits } = attempt.receipt;
      return {
        ...goOn(step.next, now),
        claim,
        stepChange: { outcome: 'sent', providerMessageId, sentAt: at },
        credits: { settle: 'charge', quantity: credits },
      };
    }
    if (refusal) {
      const result = { ...failed(refusal.message, now), claim };
      // Only the earlier attempt might have sent. Restore its original place in the cap.
      if (previousDispatchAt)
        return {
          ...endWithUnknownOutcome(result),
          stepChange: { outcome: 'unconfirmed', sentAt: previousDispatchAt },
        };
      return { ...result, stepChange: { outcome: 'failed' }, credits: { settle: 'release' } };
    }
    return retryAfterError(claim, firstTriedAt, now);
  }

  async reserveCredits(storeId: string, claim: RunClaim, quantity: number) {
    try {
      await this.wallets.reserve(storeId, {
        wallet: 'sms_credits',
        quantity,
        idempotencyKey: operationKey(claim),
        actor: system,
      });
      return true;
    } catch (error) {
      if (error instanceof AppError && error.code === 'WALLET_BALANCE_TOO_LOW') return false;
      throw error;
    }
  }

  async settleCredits(storeId: string, claim: RunClaim, credits: CreditSettlement) {
    const key = operationKey(claim);
    // Every send row was written with its reservation, in the same transaction.
    const reservationId = (await this.wallets.findByIdempotencyKey(storeId, key))!.entryId;
    if (credits.settle === 'charge')
      await this.wallets.charge(storeId, {
        reservationId,
        quantity: credits.quantity,
        idempotencyKey: `${key}:charge`,
        actor: system,
      });
    else
      await this.wallets.release(storeId, {
        reservationId,
        idempotencyKey: `${key}:release`,
        actor: system,
      });
  }
}
