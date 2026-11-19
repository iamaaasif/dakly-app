import 'reflect-metadata';
import { createHash, createHmac, createSecretKey, timingSafeEqual } from 'node:crypto';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
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
import { outboxEvents, webhookEvents } from '@dakly/db/schema/platform';
import { stores } from '@dakly/db/schema/stores';
import type { PaymentDriver } from '@dakly/providers/payment/payment-driver';

import type { NotificationsService } from '../notifications/notifications.service';
import type { RateLimiter } from '../platform/cache/rate-limiter';
import { Clock } from '../platform/clock';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { StoreTransaction } from '../platform/database/store-transaction';
import { TenantDatabase } from '../platform/database/tenant-database';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { OutboxRepository } from '../platform/outbox/outbox.repository';
import { OutboxService } from '../platform/outbox/outbox.service';
import type { StoresService } from '../stores/stores.service';
import { VerifyPaymentJob } from './jobs/verify-payment.job';
import { PaymentCallbackVerificationService } from './payment-callback-verification.service';
import { PaymentCallbacksController } from './payment-callbacks.controller';
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
const transaction = new StoreTransaction(database);
const outbox = new OutboxService(new OutboxRepository(app.db, database), transaction);
const payments = new PaymentsService(repository, transaction, clock, outbox, {
  notify: async () => {},
} as NotificationsService);
const signingKey = 'test-payment-callback-signing-key';
const driver: PaymentDriver = {
  gateway: 'bkash',
  callbackHeaders: ['x-test-signature'],
  callbackReference(rawBody) {
    return JSON.parse(rawBody.toString()) as string;
  },
  async createPayment(input) {
    return { gatewayPaymentId: input.orderReference, redirectUrl: 'https://checkout.example' };
  },
  async getStatus(gatewayPaymentId) {
    return paid(gatewayPaymentId);
  },
  verifyCallback(rawBody, headers, merchant) {
    const key = merchant.flow === 'shop' ? merchant.credentials : signingKey;
    const digest = createHmac('sha256', key).update(rawBody).digest();
    const header = headers['x-test-signature'];
    if (typeof header !== 'string') return;
    const signature = Buffer.from(header, 'hex');
    if (signature.length !== digest.length || !timingSafeEqual(signature, digest)) return;
    const merchantReference = JSON.parse(rawBody.toString()) as string;
    return { eventId: 'callback-' + merchantReference, merchantReference };
  },
};
const callbackRepository = new PaymentCallbacksRepository(app.db);
const jobs: { webhookEventId: string; attemptId: string }[] = [];
const encryption = new EnvelopeEncryption({
  currentKeyVersion: 1,
  masterKeys: new Map([[1, createSecretKey(Buffer.alloc(32, 1))]]),
});
const callbacks = new PaymentCallbacksService(
  callbackRepository,
  clock,
  [driver],
  { consume: async () => ({ allowed: true, retryAfter: 0 }) } as RateLimiter,
  { add: async (_name: string, job: (typeof jobs)[number]) => jobs.push(job) } as Queue,
);
const verifier = new PaymentCallbackVerificationService(
  callbackRepository,
  repository,
  payments,
  clock,
  encryption,
  [driver],
);
const gateway = new PaymentGatewayService(payments, repository, clock, encryption, [driver]);
const verify = new VerifyPaymentJob(gateway);
const externalIds = new Set<string>();
class PaymentTestModule {}
Module({
  controllers: [PaymentCallbacksController],
  providers: [{ provide: PaymentCallbacksService, useValue: callbacks }],
})(PaymentTestModule);
let http: NestFastifyApplication;

let storeA: string;
let storeB: string;

beforeAll(async () => {
  http = await NestFactory.create<NestFastifyApplication>(PaymentTestModule, new FastifyAdapter(), {
    rawBody: true,
    logger: false,
  });
  http.useGlobalFilters(new AppErrorFilter());
  await http.init();
  const created = await admin.db
    .insert(stores)
    .values([{ name: 'Payments A' }, { name: 'Payments B' }])
    .returning({ id: stores.id });
  storeA = created[0]!.id;
  storeB = created[1]!.id;
});

afterAll(async () => {
  await http?.close();
  await admin.db.delete(webhookEvents).where(inArray(webhookEvents.externalId, [...externalIds]));
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
    await admin.db.delete(outboxEvents).where(inArray(outboxEvents.storeId, [storeA, storeB]));
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

async function deliver(payload: string, key = signingKey, signed = payload) {
  externalIds.add(createHash('sha256').update(payload).digest('hex'));
  return http.inject({
    method: 'POST',
    url: '/webhooks/payments/bkash',
    headers: {
      'content-type': 'application/json',
      'x-test-signature': createHmac('sha256', key).update(signed).digest('hex'),
    },
    payload,
  });
}

async function receipt(payload: string) {
  const [row] = await admin.db
    .select()
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.provider, 'bkash'),
        eq(webhookEvents.externalId, createHash('sha256').update(payload).digest('hex')),
      ),
    );
  return row;
}

async function processReceipt(payload: string) {
  const id = (await receipt(payload))!.id;
  const job = jobs.findLast((candidate) => candidate.webhookEventId === id)!;
  await verifier.process(job.webhookEventId, job.attemptId, false);
}

async function shopCredential(storeId: string, key: string) {
  const protectedKey = encryption.encrypt(
    { owner: 'store', storeId, purpose: 'payment-gateway-credentials' },
    Buffer.from(key),
  );
  const [row] = await admin.db
    .insert(paymentGatewayCredentials)
    .values({
      ...protectedKey,
      storeId,
      gateway: 'bkash',
      mode: 'live',
      accountLabel: 'Shop merchant',
    })
    .returning({ id: paymentGatewayCredentials.id });
  return row!.id;
}

describe('Payment intents (Postgres)', () => {
  it('writes one callback event when the same delivery races itself', async () => {
    const intent = await pendingIntent();
    const original = JSON.stringify(intent.merchantReference);
    const tampered = original + ' ';
    expect((await deliver(tampered, signingKey, original)).statusCode).toBe(204);
    await processReceipt(tampered);
    expect(await receipt(tampered)).toMatchObject({ status: 'ignored', payload: null });
    const deliveries = await Promise.all([deliver(original), deliver(original)]);
    expect(deliveries.map(({ statusCode }) => statusCode)).toEqual([204, 204]);
    await Promise.all([processReceipt(original), processReceipt(original)]);
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
    const published = await admin.db
      .select({ type: outboxEvents.type })
      .from(outboxEvents)
      .where(eq(outboxEvents.storeId, storeA));
    expect(published.map(({ type }) => type).sort()).toEqual([
      'payment.succeeded',
      'payment.verification_requested',
    ]);
  });

  it('ignores another shop signature and accepts the correct signature for the same bytes', async () => {
    const ownKey = 'shop-a-callback-key';
    const otherKey = 'shop-b-callback-key';
    const credentialId = await shopCredential(storeA, ownKey);
    await shopCredential(storeB, otherKey);
    const intent = await payments.create(storeA, {
      flow: 'shop',
      gateway: 'bkash',
      purpose: 'order_advance',
      credentialId,
      amountPoisha: 12000,
      expiresAt: new Date('2026-11-19T04:00:00.000Z'),
    });
    await payments.redirected(storeA, intent.id, intent.merchantReference);
    const payload = JSON.stringify(intent.merchantReference);
    const callbackRows = () =>
      admin.db
        .select()
        .from(paymentEvents)
        .where(
          and(eq(paymentEvents.paymentIntentId, intent.id), eq(paymentEvents.kind, 'callback')),
        );
    expect((await deliver(payload, otherKey)).statusCode).toBe(204);
    await processReceipt(payload);
    expect(await receipt(payload)).toMatchObject({ status: 'ignored', payload: null });
    expect(await callbackRows()).toEqual([]);

    expect((await deliver(payload, ownKey)).statusCode).toBe(204);
    await processReceipt(payload);
    expect(await receipt(payload)).toMatchObject({ status: 'processed', payload: null });
    expect(await callbackRows()).toHaveLength(1);
    expect(await repository.find(storeA, intent.id)).toMatchObject({
      status: 'pending',
      nextCheckAt: now,
    });
  });

  it('rejects an oversized callback before storing it', async () => {
    const payload = JSON.stringify('x'.repeat(64 * 1024));
    expect((await deliver(payload)).statusCode).toBe(413);
    expect(await receipt(payload)).toBeUndefined();
  });

  it('keeps a queued valid delivery when an invalid signature arrives for the same body', async () => {
    const intent = await pendingIntent();
    const payload = JSON.stringify(intent.merchantReference);
    expect((await deliver(payload)).statusCode).toBe(204);
    const valid = jobs.at(-1)!;
    expect((await deliver(payload, 'other-key')).statusCode).toBe(204);
    const invalid = jobs.at(-1)!;
    expect(invalid.webhookEventId).toBe(valid.webhookEventId);
    await verifier.process(invalid.webhookEventId, invalid.attemptId, false);
    await verifier.process(valid.webhookEventId, valid.attemptId, false);
    expect(await receipt(payload)).toMatchObject({ status: 'processed', payload: null });
    expect(await repository.find(storeA, intent.id)).toMatchObject({ nextCheckAt: now });
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

  it('requeues the persisted signature after a delivery job is lost', async () => {
    const intent = await pendingIntent();
    const payload = JSON.stringify(intent.merchantReference);
    expect((await deliver(payload)).statusCode).toBe(204);
    const lost = jobs.pop()!;
    const originalClock = clock.now;
    clock.now = () => new Date('2026-11-19T03:02:00.000Z');
    try {
      await callbacks.recoverPending();
      expect(jobs).toContainEqual(lost);
      await verifier.process(lost.webhookEventId, lost.attemptId, false);
    } finally {
      clock.now = originalClock;
    }
    expect(await receipt(payload)).toMatchObject({ status: 'processed', payload: null });
  });

  it('moves a failed provider check out of the due page so other intents can run', async () => {
    const intent = await pendingIntent();
    const unavailable = new PaymentGatewayService(payments, repository, clock, encryption, [
      {
        ...driver,
        async getStatus() {
          throw new Error('Gateway unavailable');
        },
      },
    ]);
    const originalClock = clock.now;
    clock.now = () => new Date('2026-11-19T03:01:00.000Z');
    try {
      await expect(
        new VerifyPaymentJob(unavailable).handle({ storeId: storeA, paymentIntentId: intent.id }),
      ).rejects.toThrow('Gateway unavailable');
    } finally {
      clock.now = originalClock;
    }
    expect(await repository.find(storeA, intent.id)).toMatchObject({
      status: 'pending',
      nextCheckAt: new Date('2026-11-19T03:01:30.000Z'),
    });
  });

  it('keeps the new check due if an earlier query reports cancellation', async () => {
    const intent = await pendingIntent();
    const firstDue = new Date('2026-11-19T03:01:00.000Z');
    const originalClock = clock.now;
    clock.now = () => firstDue;
    try {
      await payments.recordCallback(storeA, intent.id, 'bkash', {
        eventId: 'new-callback-check',
        merchantReference: intent.merchantReference,
      });
      await payments.applyStatus(storeA, intent.id, { status: 'cancelled' }, firstDue);
    } finally {
      clock.now = originalClock;
    }
    expect(await repository.find(storeA, intent.id)).toMatchObject({
      status: 'pending',
      nextCheckAt: new Date('2026-11-19T03:00:59.999Z'),
    });
  });

  it('expires an intent if its due query returns a different reference after expiry', async () => {
    const intent = await pendingIntent();
    const originalClock = clock.now;
    clock.now = () => new Date('2026-11-19T04:00:00.000Z');
    try {
      await payments.applyStatus(
        storeA,
        intent.id,
        paid('another-order'),
        new Date('2026-11-19T03:01:00.000Z'),
      );
    } finally {
      clock.now = originalClock;
    }
    expect(await repository.find(storeA, intent.id)).toMatchObject({
      status: 'expired',
      nextCheckAt: new Date('2026-11-19T04:04:00.000Z'),
    });
  });

  it('keeps checking past expiry and records a later capture for review', async () => {
    const intent = await pendingIntent();
    const originalClock = clock.now;
    clock.now = () => new Date('2026-11-19T04:00:00.000Z');
    try {
      await payments.applyStatus(
        storeA,
        intent.id,
        { status: 'pending' },
        new Date('2026-11-19T03:01:00.000Z'),
      );
      const expired = await repository.find(storeA, intent.id);
      expect(expired).toMatchObject({
        status: 'expired',
        nextCheckAt: new Date('2026-11-19T04:04:00.000Z'),
      });
      clock.now = () => new Date('2026-11-19T04:04:00.000Z');
      await verify.handle({ storeId: storeA, paymentIntentId: intent.id });
      expect(await repository.find(storeA, intent.id)).toMatchObject({
        status: 'needs_review',
        reviewReason: 'late_success',
        succeededAt: null,
        nextCheckAt: null,
      });
    } finally {
      clock.now = originalClock;
    }
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
      callbacks,
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
