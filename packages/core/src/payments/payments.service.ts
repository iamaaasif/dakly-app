import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { CreatePaymentIntent } from '@dakly/contracts/payments';
import type {
  PaymentCallback,
  PaymentGateway,
  PaymentStatus,
} from '@dakly/providers/payment/payment-driver';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { MINUTE_MS } from '../platform/time';
import { PAYMENT_ERRORS } from './payments.errors';
import { PaymentsRepository } from './payments.repository';

type PaidStatus = Extract<PaymentStatus, { status: 'paid' }>;

type Intent = NonNullable<Awaited<ReturnType<PaymentsRepository['find']>>>;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly repository: PaymentsRepository,
    private readonly transaction: StoreTransaction,
    private readonly clock: Clock,
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
        createdAt: now,
        updatedAt: now,
      });
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
      if (intent.status !== 'created') return;
      const now = this.clock.now();
      if (intent.expiresAt <= now || intent.voidedAt) return;
      await this.repository.update(storeId, intent.id, intent.status, {
        status: 'pending',
        gatewayPaymentId,
        nextCheckAt: new Date(now.getTime() + MINUTE_MS),
        updatedAt: now,
      });
      await this.repository.appendEvent(storeId, {
        paymentIntentId: intent.id,
        kind: 'redirected',
        fromStatus: intent.status,
        toStatus: 'pending',
        createdAt: now,
      });
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
        await this.repository.update(storeId, intent.id, intent.status, {
          nextCheckAt: now,
          updatedAt: now,
        });
      }
    });
  }

  expire(storeId: string, intentId: string) {
    return this.transaction.run(storeId, async () => {
      const intent = await this.lockIntent(storeId, intentId);
      const now = this.clock.now();
      if (intent.expiresAt <= now && (intent.status === 'created' || intent.status === 'pending'))
        await this.transition(storeId, intent, { status: 'expired' }, now);
    });
  }

  applyStatus(storeId: string, intentId: string, result: PaymentStatus) {
    return this.transaction.run(storeId, async () => {
      const intent = await this.lockIntent(storeId, intentId);
      const now = this.clock.now();
      const change = this.verifiedChange(intent, result, now);
      if (change) {
        await this.transition(
          storeId,
          intent,
          change,
          now,
          result.status === 'paid' ? result : undefined,
        );
      }
    });
  }

  private verifiedChange(intent: Intent, result: PaymentStatus, now: Date) {
    if (result.status === 'paid') return this.paidChange(intent, result, now);
    if (intent.status !== 'pending') return;
    if (intent.expiresAt <= now) return { status: 'expired' } as const;
    if (result.status !== 'pending') return { status: result.status } as const;
  }

  private paidChange(intent: Intent, result: PaidStatus, now: Date, verified?: PaidStatus) {
    if (intent.status !== 'pending' && intent.status !== 'expired' && intent.status !== 'failed')
      return;
    if (result.merchantReference !== intent.merchantReference) return;
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
    now: Date,
    verified?: PaidStatus,
  ) {
    const result = await this.repository.update(storeId, intent.id, intent.status, {
      ...change,
      nextCheckAt: null,
      updatedAt: now,
    });
    if (result === 'unchanged') return;
    if (result === 'duplicate') {
      await this.transition(
        storeId,
        intent,
        { status: 'needs_review', reviewReason: 'duplicate' },
        now,
        verified,
      );
      return;
    }
    await this.repository.appendEvent(storeId, {
      paymentIntentId: intent.id,
      kind: 'status_changed',
      fromStatus: intent.status,
      toStatus: change.status,
      gatewayReference: verified?.transactionId,
      eventPayload: verified && {
        amountPoisha: verified.amountPoisha,
        currency: verified.currency,
      },
      createdAt: now,
    });
  }
}
