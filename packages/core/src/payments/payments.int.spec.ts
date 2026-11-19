import { createHmac, createSecretKey, timingSafeEqual } from 'node:crypto';

import type { Queue } from 'bullmq';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import {
  gatewaySettlementLines,
  paymentEvents,
  paymentGatewayCredentials,
  paymentIntents,
} from '@dakly/db/schema/payments';
import { stores } from '@dakly/db/schema/stores';
import type { PaymentDriver } from '@dakly/providers/payment/payment-driver';

import { Clock } from '../platform/clock';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { StoreTransaction } from '../platform/database/store-transaction';
import { TenantDatabase } from '../platform/database/tenant-database';
import type { StoresService } from '../stores/stores.service';
import { VerifyPaymentJob } from './jobs/verify-payment.job';
import { PaymentCallbacksRepository } from './payment-callbacks.repository';
import { PaymentCallbacksService } from './payment-callbacks.service';
import { PaymentGatewayService } from './payment-gateway.service';
import { PaymentJobsService } from './payment-jobs.service';
import { PaymentSettlementsRepository } from './payment-settlements.repository';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const app = createDatabase(process.env.DATABASE_URL!);
const database = new TenantDatabase(app.db);
const clock = new Clock();
const now = new Date('2026-11-19T03:00:00.000Z');
clock.now = () => now;
const repository = new PaymentsRepository(database);
const payments = new PaymentsService(repository, new StoreTransaction(database), clock);
const signingKey = 'test-payment-callback-signing-key';
const driver: PaymentDriver = {
  gateway: 'bkash',
  async createPayment(input) {
    return { gatewayPaymentId: input.orderReference, redirectUrl: 'https://checkout.example' };
  },
  async getStatus(gatewayPaymentId) {
    return paid(gatewayPaymentId);
  },
  verifyCallback(rawBody, headers) {
    const digest = createHmac('sha256', signingKey).update(rawBody).digest();
    const header = headers['x-test-signature'];
    if (typeof header !== 'string') return;
    const signature = Buffer.from(header, 'hex');
    if (signature.length !== digest.length || !timingSafeEqual(signature, digest)) return;
    return { eventId: 'callback-replay', merchantReference: rawBody.toString() };
  },
};
const callbackRepository = new PaymentCallbacksRepository(app.db);
const callbacks = new PaymentCallbacksService(callbackRepository, payments, [driver]);
const encryption = new EnvelopeEncryption({
  currentKeyVersion: 1,
  masterKeys: new Map([[1, createSecretKey(Buffer.alloc(32, 1))]]),
});
const gateway = new PaymentGatewayService(payments, repository, clock, encryption, [driver]);
const verify = new VerifyPaymentJob(gateway);
let storeA: string;
let storeB: string;

beforeAll(async () => {
  const created = await admin.db
    .insert(stores)
    .values([{ name: 'Payments A' }, { name: 'Payments B' }])
    .returning({ id: stores.id });
  storeA = created[0]!.id;
  storeB = created[1]!.id;
});

afterAll(async () => {
  if (storeA && storeB) {
    await admin.db.delete(gatewaySettlementLines).where(
      inArray(
        gatewaySettlementLines.gatewayTransactionId,
        admin.db
          .select({ id: paymentIntents.merchantReference })
          .from(paymentIntents)
          .where(inArray(paymentIntents.storeId, [storeA, storeB])),
      ),
    );
    await admin.db.delete(paymentEvents).where(inArray(paymentEvents.storeId, [storeA, storeB]));
    await admin.db.delete(paymentIntents).where(inArray(paymentIntents.storeId, [storeA, storeB]));
    await admin.db
      .delete(paymentGatewayCredentials)
      .where(inArray(paymentGatewayCredentials.storeId, [storeA, storeB]));
    await admin.db.delete(stores).where(inArray(stores.id, [storeA, storeB]));
  }
  await Promise.all([admin.pool.end(), app.pool.end()]);
});

function createIntent() {
  return payments.create(storeA, {
    flow: 'billing',
    gateway: 'bkash',
    purpose: 'subscription',
    amountPoisha: 12000,
    expiresAt: new Date('2026-11-19T04:00:00.000Z'),
  });
}

async function pendingIntent() {
  const intent = await createIntent();
  await payments.redirected(storeA, intent.id, intent.merchantReference);
  return intent;
}

function paid(merchantReference: string, amountPoisha = 12000) {
  return {
    status: 'paid',
    merchantReference,
    amountPoisha,
    currency: 'BDT',
    transactionId: merchantReference,
  } as const;
}

describe('Payment intents (Postgres)', () => {
  it('writes one callback event when the same delivery races itself', async () => {
    const intent = await pendingIntent();
    const rawBody = Buffer.from(intent.merchantReference);
    const headers = {
      'x-test-signature': createHmac('sha256', signingKey).update(rawBody).digest('hex'),
    };
    await expect(
      callbacks.receive('bkash', Buffer.from(intent.merchantReference + ' '), headers),
    ).rejects.toMatchObject({ code: 'PAYMENT_SIGNATURE_INVALID' });
    await Promise.all([
      callbacks.receive('bkash', rawBody, headers),
      callbacks.receive('bkash', rawBody, headers),
    ]);
    const rows = await admin.db
      .select()
      .from(paymentEvents)
      .where(and(eq(paymentEvents.paymentIntentId, intent.id), eq(paymentEvents.kind, 'callback')));
    expect(rows).toHaveLength(1);
    expect(await repository.find(storeA, intent.id)).toMatchObject({ status: 'pending' });
    await payments.applyStatus(storeA, intent.id, paid(intent.merchantReference));
    await payments.applyStatus(storeA, intent.id, paid(intent.merchantReference));
    expect(await repository.find(storeA, intent.id)).toMatchObject({ status: 'succeeded' });
    const changes = await admin.db
      .select()
      .from(paymentEvents)
      .where(
        and(eq(paymentEvents.paymentIntentId, intent.id), eq(paymentEvents.toStatus, 'succeeded')),
      );
    expect(changes).toHaveLength(1);
  });

  it('refuses a verified payment with a different amount', async () => {
    const intent = await pendingIntent();
    await payments.applyStatus(storeA, intent.id, paid(intent.merchantReference, 13000));
    expect(await repository.find(storeA, intent.id)).toMatchObject({
      status: 'needs_review',
      reviewReason: 'amount_mismatch',
      succeededAt: null,
    });
  });

  it('does not succeed an expired intent', async () => {
    const intent = await pendingIntent();
    await admin.db
      .update(paymentIntents)
      .set({ expiresAt: now })
      .where(eq(paymentIntents.id, intent.id));
    await payments.expire(storeA, intent.id);
    await payments.applyStatus(storeA, intent.id, paid(intent.merchantReference));
    expect(await repository.find(storeA, intent.id)).toMatchObject({
      status: 'needs_review',
      reviewReason: 'late_success',
      succeededAt: null,
    });
  });

  it('cannot read or change an intent from a different store', async () => {
    const intent = await pendingIntent();
    expect(await repository.find(storeB, intent.id)).toBeUndefined();
    await expect(
      payments.applyStatus(storeB, intent.id, paid(intent.merchantReference)),
    ).rejects.toMatchObject({ code: 'PAYMENT_INTENT_NOT_FOUND' });
    expect(await repository.find(storeA, intent.id)).toMatchObject({ status: 'pending' });
  });

  it('verifies a due attempt when no callback arrived', async () => {
    const intent = await createIntent();
    await gateway.checkout(storeA, intent.id, 'https://app.example/payment-return');
    const originalClock = clock.now;
    clock.now = () => new Date('2026-11-19T03:01:00.000Z');
    try {
      await verify.handle({ storeId: storeA, paymentIntentId: intent.id });
      await verify.handle({ storeId: storeA, paymentIntentId: intent.id });
    } finally {
      clock.now = originalClock;
    }
    expect(await repository.find(storeA, intent.id)).toMatchObject({
      status: 'succeeded',
      nextCheckAt: null,
    });
  });

  it('uses the shop credential and refuses to use it from another store', async () => {
    const credentials = encryption.encrypt(
      { owner: 'store', storeId: storeA, purpose: 'payment-gateway-credentials' },
      Buffer.from('first-shop-merchant'),
    );
    const [credential] = await admin.db
      .insert(paymentGatewayCredentials)
      .values({
        ...credentials,
        storeId: storeA,
        gateway: 'bkash',
        mode: 'live',
        accountLabel: 'Shop merchant',
      })
      .returning({ id: paymentGatewayCredentials.id });
    const input = {
      flow: 'shop',
      gateway: 'bkash',
      purpose: 'order_advance',
      credentialId: credential!.id,
      amountPoisha: 12000,
      expiresAt: new Date('2026-11-19T04:00:00.000Z'),
    } as const;
    await expect(payments.create(storeB, input)).rejects.toMatchObject({
      code: 'PAYMENT_CREDENTIAL_UNAVAILABLE',
    });
    const intent = await payments.create(storeA, input);
    const shopGateway = new PaymentGatewayService(payments, repository, clock, encryption, [
      {
        ...driver,
        async createPayment(checkout, merchant) {
          if (merchant.flow !== 'shop' || merchant.credentials.toString() !== 'first-shop-merchant')
            throw new Error('Wrong merchant account');
          return driver.createPayment(checkout, merchant);
        },
      },
    ]);
    await expect(
      shopGateway.checkout(storeA, intent.id, 'https://app.example/payment-return'),
    ).resolves.toBe('https://checkout.example');
  });

  it('settles only a matching billing line and leaves mismatches for review', async () => {
    const matched = await pendingIntent();
    const unmatched = await pendingIntent();
    await payments.applyStatus(storeA, matched.id, paid(matched.merchantReference));
    await payments.applyStatus(storeA, unmatched.id, paid(unmatched.merchantReference));
    await admin.db.insert(gatewaySettlementLines).values([
      {
        gateway: 'bkash',
        gatewayTransactionId: matched.merchantReference,
        amountPoisha: 12000,
        settlementDate: '2026-11-19',
      },
      {
        gateway: 'bkash',
        gatewayTransactionId: unmatched.merchantReference,
        amountPoisha: 11999,
        settlementDate: '2026-11-19',
      },
    ]);
    const jobs = new PaymentJobsService(
      callbackRepository,
      new PaymentSettlementsRepository(database),
      {} as StoresService,
      clock,
      {} as Queue,
    );
    await jobs.reconcile(storeB, '2026-11-19', null);
    const states = () =>
      admin.db
        .select({
          status: gatewaySettlementLines.status,
          id: gatewaySettlementLines.paymentIntentId,
        })
        .from(gatewaySettlementLines)
        .where(
          inArray(gatewaySettlementLines.gatewayTransactionId, [
            matched.merchantReference,
            unmatched.merchantReference,
          ]),
        );
    expect(await states()).toEqual([
      { status: 'unmatched', id: null },
      { status: 'unmatched', id: null },
    ]);
    await jobs.reconcile(storeA, '2026-11-19', null);
    await jobs.reconcile(storeA, '2026-11-19', null);
    expect(await states()).toEqual(
      expect.arrayContaining([
        { status: 'matched', id: matched.id },
        { status: 'unmatched', id: null },
      ]),
    );
    const [settled] = await admin.db
      .select({ settledAt: paymentIntents.settledAt })
      .from(paymentIntents)
      .where(eq(paymentIntents.id, matched.id));
    expect(settled?.settledAt).toEqual(now);
  });
});
