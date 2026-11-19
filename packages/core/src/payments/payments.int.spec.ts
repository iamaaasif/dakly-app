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
  paymentEvents,
  paymentGatewayCredentials,
  paymentIntents,
} from '@dakly/db/schema/payments';
import { webhookEvents } from '@dakly/db/schema/platform';
import { stores } from '@dakly/db/schema/stores';
import type { PaymentDriver } from '@dakly/providers/payment/payment-driver';

import type { RateLimiter } from '../platform/cache/rate-limiter';
import { Clock } from '../platform/clock';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { StoreTransaction } from '../platform/database/store-transaction';
import { TenantDatabase } from '../platform/database/tenant-database';
import { AppErrorFilter } from '../platform/errors/app-error.filter';
import { createHttpServer } from '../platform/http/http-server';
import { PaymentCallbackVerificationService } from './payment-callback-verification.service';
import { PaymentCallbacksController } from './payment-callbacks.controller';
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
  http = await NestFactory.create<NestFastifyApplication>(
    PaymentTestModule,
    new FastifyAdapter(createHttpServer([])),
    { rawBody: true, logger: false },
  );
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

  it('limits queued signatures for one body and preserves the earlier attempts', async () => {
    const intent = await pendingIntent();
    const payload = JSON.stringify(intent.merchantReference);
    expect((await deliver(payload)).statusCode).toBe(204);
    const valid = jobs.at(-1)!;
    const filled = await Promise.all(
      Array.from({ length: 31 }, (_, index) => deliver(payload, `wrong-key-${index}`)),
    );
    expect(filled.every((response) => response.statusCode === 204)).toBe(true);
    expect((await deliver(payload, 'overflow-key')).statusCode).toBe(429);
    expect((await deliver(payload)).statusCode).toBe(204);
    await verifier.process(valid.webhookEventId, valid.attemptId, false);
    expect(await receipt(payload)).toMatchObject({ status: 'processed', payload: null });
  });

  it('starts a fresh retention window when a delivery reopens an ignored receipt', async () => {
    const intent = await pendingIntent();
    const payload = JSON.stringify(intent.merchantReference);
    await deliver(payload, 'other-key');
    await processReceipt(payload);
    expect(await receipt(payload)).toMatchObject({ status: 'ignored', receivedAt: now });
    const later = new Date('2026-11-27T03:00:00.000Z');
    const originalClock = clock.now;
    clock.now = () => later;
    try {
      expect((await deliver(payload)).statusCode).toBe(204);
      expect(await receipt(payload)).toMatchObject({ status: 'received', receivedAt: later });
      await processReceipt(payload);
    } finally {
      clock.now = originalClock;
    }
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
