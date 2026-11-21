import { Inject, Injectable, Logger } from '@nestjs/common';

import type { DaklyEvent } from '@dakly/contracts/events/dakly-event';

import { StaffAlertsService } from '../admin/staff-alerts.service';
import { PaymentsService } from '../payments/payments.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { BillingRepository } from './billing.repository';
import {
  DUNNING_DAYS,
  dunningStepAt,
  nextPeriodEnd,
  nextPeriodTerms,
} from './subscription-renewal';

type Subscription = NonNullable<Awaited<ReturnType<BillingRepository['lockForRenewal']>>>;

@Injectable()
export class SubscriptionRenewalService {
  constructor(
    @Inject(BillingRepository) private readonly repository: BillingRepository,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(StaffAlertsService) private readonly alerts: StaffAlertsService,
  ) {}

  private readonly logger = new Logger(SubscriptionRenewalService.name);

  // Run daily and again whenever a store is due. A free plan rolls over by itself; a paid one
  // waits for a payment, and the dunning steps count the days it stays unpaid.
  renew(storeId: string) {
    return this.transaction.run(storeId, async () => {
      const subscription = await this.repository.lockForRenewal(storeId);
      if (!subscription) return;
      const now = this.clock.now();
      if (subscription.status === 'past_due')
        return this.advanceDunning(storeId, subscription, now);
      const isRenewing = subscription.status === 'active' || subscription.status === 'trialing';
      if (!isRenewing || subscription.currentPeriodEnd > now) return;
      if (subscription.isCancellationScheduled)
        return this.repository.updateSubscription(storeId, { status: 'cancelled', updatedAt: now });
      if (this.terms(subscription).amountPoisha === 0)
        return this.startNextPeriod({
          storeId,
          subscription,
          start: subscription.currentPeriodEnd,
          now,
        });
      const dueAt = subscription.currentPeriodEnd;
      await this.repository.updateSubscription(storeId, {
        status: 'past_due',
        pastDueSince: dueAt,
        renewalAttempts: 0,
        nextRenewalAttemptAt: dunningStepAt(dueAt, 0),
        updatedAt: now,
      });
      await this.publish({
        type: 'subscription.past_due',
        storeId,
        occurredAt: now.toISOString(),
        payload: { subscriptionId: subscription.id, attempt: 0 },
      });
    });
  }

  // A paid plan payment starts the next period at once and ends any past-due or read-only state.
  // A payment below the price cannot start a period, but the shop has paid: staff are told so
  // they can settle it by hand, and the job ends instead of retrying.
  async applyPayment(storeId: string, intentId: string) {
    const shortfall = await this.transaction.run(storeId, async () => {
      const payment = await this.payments.succeededSubscriptionPayment(storeId, intentId);
      if (!payment) return;
      const subscription = await this.repository.lockForRenewal(storeId);
      if (!subscription || subscription.lastPaymentIntentId === intentId) return;
      if (subscription.status === 'cancelled') return;
      const dueAmountPoisha = this.terms(subscription).amountPoisha;
      if (payment.amountPoisha < dueAmountPoisha)
        return { paidPoisha: payment.amountPoisha, duePoisha: dueAmountPoisha };
      const now = this.clock.now();
      const start = subscription.currentPeriodEnd > now ? subscription.currentPeriodEnd : now;
      await this.startNextPeriod({ storeId, subscription, start, now, intentId });
    });
    if (shortfall) await this.reportUnderpayment(storeId, intentId, shortfall);
  }

  private async reportUnderpayment(
    storeId: string,
    intentId: string,
    { paidPoisha, duePoisha }: { paidPoisha: number; duePoisha: number },
  ) {
    this.logger.warn(`Plan payment ${intentId} is below the price for store ${storeId}`);
    const text = `A plan payment is below the price and was not applied. Store ${storeId}, payment ${intentId}: paid ${paidPoisha} poisha, due ${duePoisha} poisha. Settle it by hand.`;
    await this.alerts.notify(`subscription-underpaid-${intentId}`, text);
  }

  private async advanceDunning(storeId: string, subscription: Subscription, now: Date) {
    const { pastDueSince, nextRenewalAttemptAt, renewalAttempts: step } = subscription;
    if (!pastDueSince || !nextRenewalAttemptAt || nextRenewalAttemptAt > now) return;
    const isReadOnlyStep = step === DUNNING_DAYS.length - 1;
    await this.repository.updateSubscription(storeId, {
      status: isReadOnlyStep ? 'read_only' : 'past_due',
      readOnlySince: isReadOnlyStep ? now : undefined,
      renewalAttempts: step + 1,
      nextRenewalAttemptAt: dunningStepAt(pastDueSince, step + 1),
      updatedAt: now,
    });
    const occurredAt = now.toISOString();
    await this.publish(
      isReadOnlyStep
        ? {
            type: 'subscription.read_only',
            storeId,
            occurredAt,
            payload: { subscriptionId: subscription.id },
          }
        : {
            type: 'subscription.past_due',
            storeId,
            occurredAt,
            payload: { subscriptionId: subscription.id, attempt: step + 1 },
          },
    );
  }

  private async startNextPeriod({
    storeId,
    subscription,
    start,
    now,
    intentId,
  }: {
    storeId: string;
    subscription: Subscription;
    start: Date;
    now: Date;
    intentId?: string;
  }) {
    const { planId, pricePoisha, hasPendingChange } = this.terms(subscription);
    await this.repository.updateSubscription(storeId, {
      status: 'active',
      planId,
      currentPeriodPricePoisha: pricePoisha,
      ...(hasPendingChange && {
        pendingPlanId: null,
        pendingPricePoisha: null,
        priceChangeNotifiedAt: null,
        priceChangeStartsAt: null,
      }),
      trialEndsAt: null,
      currentPeriodStart: start,
      currentPeriodEnd: nextPeriodEnd(start, subscription.billingCycle),
      pastDueSince: null,
      renewalAttempts: 0,
      nextRenewalAttemptAt: null,
      readOnlySince: null,
      ...(intentId && { lastPaymentIntentId: intentId }),
      updatedAt: now,
    });
    await this.publish({
      type: 'subscription.renewed',
      storeId,
      occurredAt: now.toISOString(),
      payload: { subscriptionId: subscription.id },
    });
  }

  private terms(subscription: Subscription) {
    return nextPeriodTerms({
      ...subscription,
      coupon: subscription.coupon?.kind ? subscription.coupon : null,
    });
  }

  private publish(event: Extract<DaklyEvent, { type: `subscription.${string}` }>) {
    return this.outbox.publish(event);
  }
}
