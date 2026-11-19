import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { CreatePaymentIntent } from '@dakly/contracts/payments';
import type {
  PaymentCallback,
  PaymentGateway,
  PaymentStatus,
} from '@dakly/providers/payment/payment-driver';

import { NotificationsService } from '../notifications/notifications.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError, PLATFORM_ERRORS } from '../platform/errors/app-error';
import { OutboxService } from '../platform/outbox/outbox.service';
import { DAY_MS, JOB_POLL_INTERVAL_MS, MINUTE_MS } from '../platform/time';
import { PAYMENT_ERRORS } from './payments.errors';
import { PaymentsRepository } from './payments.repository';

const paymentCheckMinutes = [4, 10, 45, ...Array<number>(12).fill(360)];

type PaidStatus = Extract<PaymentStatus, { status: 'paid' }>;

type Intent = NonNullable<Awaited<ReturnType<PaymentsRepository['find']>>>;

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PaymentsRepository) private readonly repository: PaymentsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  create(storeId: string, input: CreatePaymentIntent) {
    return this.transaction.run(storeId, async () => {
      const now = this.clock.now();
      if (input.expiresAt <= now)
        throw new AppError('PAYMENT_EXPIRY_INVALID', PAYMENT_ERRORS.PAYMENT_EXPIRY_INVALID);
      const credential =
        input.flow === 'shop'
          ? await this.repository.credential(storeId, input.credentialId, input.gateway)
          : undefined;
      if (input.flow === 'shop' && !credential)
        throw new AppError(
          'PAYMENT_CREDENTIAL_UNAVAILABLE',
          PAYMENT_ERRORS.PAYMENT_CREDENTIAL_UNAVAILABLE,
        );
      const intent = await this.repository.insert(storeId, {
        ...input,
        merchantReference: `DK-${randomUUID()}`,
        shortCode: input.flow === 'shop' ? randomUUID() : null,
        isSandbox: credential?.mode === 'sandbox',
        nextCheckAt: input.expiresAt,
        createdAt: now,
        updatedAt: now,
      });
      if (!intent) throw new AppError('INTERNAL_ERROR', PLATFORM_ERRORS.INTERNAL_ERROR);
      await this.repository.appendEvent(storeId, {
        paymentIntentId: intent.id,
        kind: 'created',
        toStatus: 'created',
        createdAt: now,
      });
      return intent;
    });
  }

  redirected(storeId: string, intentId: string, gatewayPaymentId: string) {
    return this.transaction.run(storeId, async () => {
      const intent = await this.lockIntent(storeId, intentId);
      if (intent.status !== 'created') return false;
      const now = this.clock.now();
      if (intent.expiresAt <= now || intent.voidedAt) return false;
      await this.transition(
        storeId,
        intent,
        {
          status: 'pending',
          gatewayPaymentId,
          nextCheckAt: new Date(Math.min(now.getTime() + MINUTE_MS, intent.expiresAt.getTime())),
        },
        { now, kind: 'redirected' },
      );
      return true;
    });
  }

  recordCallback(
    storeId: string,
    intentId: string,
    gateway: PaymentGateway,
    callback: PaymentCallback,
  ) {
    return this.transaction.run(storeId, async () => {
      const intent = await this.lockIntent(storeId, intentId);
      if (intent.gateway !== gateway || intent.merchantReference !== callback.merchantReference)
        throw new AppError('PAYMENT_INTENT_NOT_FOUND', PAYMENT_ERRORS.PAYMENT_INTENT_NOT_FOUND);
      const now = this.clock.now();
      const event = await this.repository.appendEvent(storeId, {
        paymentIntentId: intent.id,
        kind: 'callback',
        gateway,
        gatewayEventId: callback.eventId,
        createdAt: now,
      });
      if (event && ['pending', 'expired', 'failed'].includes(intent.status)) {
        const priorCheck = intent.nextCheckAt?.getTime();
        // Each callback invalidates the result of a check that already started.
        const due =
          priorCheck === undefined ? now : new Date(Math.min(now.getTime(), priorCheck - 1));
        await this.repository.update(storeId, intent.id, intent.status, {
          nextCheckAt: due,
          updatedAt: now,
        });
        await this.outbox.publish({
          type: 'payment.verification_requested',
          storeId,
          occurredAt: now.toISOString(),
          payload: { paymentIntentId: intent.id },
        });
      }
    });
  }

  expire(storeId: string, intentId: string) {
    return this.transaction.run(storeId, async () => {
      const intent = await this.lockIntent(storeId, intentId);
      const now = this.clock.now();
      if (intent.expiresAt <= now && (intent.status === 'created' || intent.status === 'pending'))
        await this.transition(storeId, intent, { status: 'expired' }, { now });
    });
  }

  applyStatus(storeId: string, intentId: string, result: PaymentStatus, checkedAt?: Date) {
    return this.transaction.run(storeId, async () => {
      const intent = await this.lockIntent(storeId, intentId);
      const now = this.clock.now();
      const isCurrentCheck = checkedAt?.getTime() === intent.nextCheckAt?.getTime();
      const verified = this.matchPayment(intent, result);
      if (checkedAt && !isCurrentCheck && !verified) return;
      const change = verified
        ? this.paidChange(intent, verified, now)
        : this.unpaidChange(intent, result, now);
      if (change) {
        await this.transition(storeId, intent, change, { now, verified });
      } else if (checkedAt && isCurrentCheck) {
        await this.advanceCheck(storeId, intent, now);
      }
    });
  }

  retryCheck(storeId: string, intentId: string, checkedAt: Date) {
    return this.transaction.run(storeId, async () => {
      const intent = await this.lockIntent(storeId, intentId);
      if (checkedAt.getTime() !== intent.nextCheckAt?.getTime()) return;
      const now = this.clock.now();
      const nextCheckAt =
        now.getTime() < intent.expiresAt.getTime() + 3 * DAY_MS
          ? new Date(now.getTime() + JOB_POLL_INTERVAL_MS)
          : null;
      if (intent.status === 'pending' && intent.expiresAt <= now) {
        await this.transition(storeId, intent, { status: 'expired', nextCheckAt }, { now });
        return;
      }
      await this.repository.update(storeId, intentId, intent.status, {
        nextCheckAt,
        updatedAt: now,
      });
    });
  }

  private async advanceCheck(storeId: string, intent: Intent, now: Date) {
    await this.repository.update(storeId, intent.id, intent.status, {
      checkCount: intent.checkCount + 1,
      nextCheckAt: this.nextCheck(intent, intent.status, now),
      updatedAt: now,
    });
  }

  private nextCheck(intent: Intent, status: Intent['status'], now: Date) {
    const delay = paymentCheckMinutes[intent.checkCount];
    const next = delay === undefined ? null : new Date(now.getTime() + delay * MINUTE_MS);
    if (status === 'expired') return next;
    if (status === 'pending') return !next || next > intent.expiresAt ? intent.expiresAt : next;
    return null;
  }

  private matchPayment(intent: Intent, result: PaymentStatus) {
    if (result.status === 'paid' && result.merchantReference === intent.merchantReference)
      return result;
  }

  private unpaidChange(intent: Intent, result: PaymentStatus, now: Date) {
    if (intent.status !== 'pending') return;
    if (intent.expiresAt <= now) {
      return {
        status: 'expired',
        checkCount: intent.checkCount + 1,
        nextCheckAt: this.nextCheck(intent, 'expired', now),
      } as const;
    }
    if (result.status === 'failed' || result.status === 'cancelled')
      return { status: result.status } as const;
  }

  private paidChange(intent: Intent, result: PaidStatus, now: Date) {
    if (intent.status !== 'pending' && intent.status !== 'expired' && intent.status !== 'failed')
      return;
    if (result.amountPoisha !== intent.amountPoisha || result.currency !== intent.currency)
      return { status: 'needs_review', reviewReason: 'amount_mismatch' } as const;
    if (intent.status !== 'pending' || intent.expiresAt <= now || intent.voidedAt)
      return { status: 'needs_review', reviewReason: 'late_success' } as const;

    return {
      status: 'succeeded',
      gatewayTransactionId: result.transactionId,
      verifiedAmountPoisha: result.amountPoisha,
      succeededAt: now,
    } as const;
  }

  private async lockIntent(storeId: string, intentId: string) {
    const intent = await this.repository.find(storeId, intentId, true);
    if (!intent)
      throw new AppError('PAYMENT_INTENT_NOT_FOUND', PAYMENT_ERRORS.PAYMENT_INTENT_NOT_FOUND);
    return intent;
  }

  private async transition(
    storeId: string,
    intent: Intent,
    change: Parameters<PaymentsRepository['update']>[3] & { status: Intent['status'] },
    {
      now,
      verified,
      kind = 'status_changed',
    }: { now: Date; verified?: PaidStatus; kind?: 'redirected' | 'status_changed' },
  ): Promise<void> {
    const result = await this.repository.update(storeId, intent.id, intent.status, {
      nextCheckAt: null,
      ...change,
      updatedAt: now,
    });
    if (result === 'unchanged') return;
    if (result === 'duplicate')
      return this.transition(
        storeId,
        intent,
        { status: 'needs_review', reviewReason: 'duplicate' },
        { now, verified },
      );
    await this.repository.appendEvent(storeId, {
      paymentIntentId: intent.id,
      kind,
      fromStatus: intent.status,
      toStatus: change.status,
      gatewayReference: verified?.transactionId,
      eventPayload: verified && {
        amountPoisha: verified.amountPoisha,
        currency: verified.currency,
      },
      createdAt: now,
    });
    await this.publishTransition(storeId, intent, change, now);
  }

  private async publishTransition(
    storeId: string,
    intent: Intent,
    change: Pick<Intent, 'status'> & { reviewReason?: Intent['reviewReason'] },
    now: Date,
  ) {
    if (!intent.isSandbox && (change.status === 'succeeded' || change.status === 'failed')) {
      await this.outbox.publish({
        type: change.status === 'succeeded' ? 'payment.succeeded' : 'payment.failed',
        storeId,
        occurredAt: now.toISOString(),
        payload: { paymentIntentId: intent.id },
      });
    }
    if (change.reviewReason === 'amount_mismatch') {
      await this.notifications.notify(storeId, {
        type: 'payment.amount_mismatch',
        category: 'billing',
        dedupeKey: `payment-amount-mismatch-${intent.id}`,
        recipientPermission: intent.flow === 'shop' ? 'orders.edit' : 'billing.view',
        title: 'A payment amount needs review',
      });
    }
  }
}
