import { createHmac, timingSafeEqual } from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { paymentEvents, paymentIntents } from '@dakly/db/schema/payments';
import { stores } from '@dakly/db/schema/stores';
import type { PaymentDriver } from '@dakly/providers/payment/payment-driver';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { TenantDatabase } from '../platform/database/tenant-database';
import { PaymentCallbacksRepository } from './payment-callbacks.repository';
import { PaymentCallbacksService } from './payment-callbacks.service';
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
const callbacks = new PaymentCallbacksService(new PaymentCallbacksRepository(app.db), payments, [
  driver,
]);
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
    await admin.db.delete(paymentEvents).where(inArray(paymentEvents.storeId, [storeA, storeB]));
    await admin.db.delete(paymentIntents).where(inArray(paymentIntents.storeId, [storeA, storeB]));
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
});
