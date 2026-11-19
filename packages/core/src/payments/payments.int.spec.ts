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
const jobs: { webhookEventId: string }[] = [];
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
  const headers = signatureHeaders(key, signed);
  externalIds.add(receiptId(payload, headers));
  return http.inject({
    method: 'POST',
    url: '/webhooks/payments/bkash',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    payload,
  });
}

function signatureHeaders(key: string, signed: string) {
  return { 'x-test-signature': createHmac('sha256', key).update(signed).digest('hex') };
}

function receiptId(payload: string, headers: ReturnType<typeof signatureHeaders>) {
  return createHash('sha256').update(payload).update(JSON.stringify(headers)).digest('hex');
}

async function receipt(payload: string, key = signingKey, signed = payload) {
  const [row] = await admin.db
    .select()
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.provider, 'bkash'),
        eq(webhookEvents.externalId, receiptId(payload, signatureHeaders(key, signed))),
      ),
    );
  return row;
}

async function processReceipt(payload: string, key = signingKey, signed = payload) {
  const id = (await receipt(payload, key, signed))!.id;
  const job = jobs.find((candidate) => candidate.webhookEventId === id)!;
  await verifier.process(job.webhookEventId, false);
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
    await processReceipt(tampered, signingKey, original);
    expect(await receipt(tampered, signingKey, original)).toMatchObject({
      status: 'ignored',
      payload: null,
    });
    const deliveries = await Promise.all([deliver(original), deliver(original)]);
    expect(deliveries.map(({ statusCode }) => statusCode)).toEqual([204, 204]);
    const valid = (await receipt(original))!.id;
    expect(jobs.filter((job) => job.webhookEventId === valid)).toHaveLength(1);
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

  it('keeps a valid shop delivery when a forged callback has the same body', async () => {
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
    expect((await deliver(payload, ownKey)).statusCode).toBe(204);
    expect((await deliver(payload, otherKey)).statusCode).toBe(204);
    expect((await receipt(payload, ownKey))!.id).not.toBe((await receipt(payload, otherKey))!.id);
    await processReceipt(payload, otherKey);
    expect(await receipt(payload, otherKey)).toMatchObject({ status: 'ignored', payload: null });
    expect(await callbackRows()).toEqual([]);
    await processReceipt(payload, ownKey);
    expect(await receipt(payload, ownKey)).toMatchObject({ status: 'processed', payload: null });
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
