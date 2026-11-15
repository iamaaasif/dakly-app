import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FakeSmsDriver } from '@dakly/providers/sms/fake-sms-driver';

import { EmailService } from '../email/email.service';
import { RateLimiter } from '../platform/cache/rate-limiter';
import { ValkeyClient } from '../platform/cache/valkey-client';
import { SmsService } from '../sms/sms.service';
import { InviteDelivery } from './invite-delivery';

describe('invite delivery limits in Valkey', () => {
  const client = new ValkeyClient(process.env.REDIS_URL!);
  const keys = new Set<string>();
  const delivery = new InviteDelivery(
    new SmsService(new FakeSmsDriver()),
    new EmailService({ async send() {} }),
    new RateLimiter(client),
    'http://localhost:3000',
  );
  const key = (kind: string, value: string) => {
    const result = `team-invite:${kind}:${createHash('sha256').update(value).digest('hex')}`;
    keys.add(result);
    return result;
  };
  const reserve = (storeId: string, email: string, ip: string) => {
    const recipient = JSON.stringify([storeId, email]);
    key('recipient', recipient);
    key('cooldown', recipient);
    key('ip', ip);
    return delivery.reserve(storeId, { email }, ip);
  };
  beforeAll(async () => {
    await client.onModuleInit();
  });
  afterAll(async () => {
    await client.connection.del(...keys);
    client.onApplicationShutdown();
  });
  it('shares a recipient cooldown across send and resend, then caps five sends per store each hour', async () => {
    const store = randomUUID();
    const email = `${randomUUID()}@example.test`;
    const ip = randomUUID();
    await reserve(store, email, ip);
    await expect(reserve(store, email, ip)).rejects.toMatchObject({ code: 'INVITE_RATE_LIMITED' });
    const cooldown = key('cooldown', JSON.stringify([store, email]));
    expect(await client.connection.ttl(cooldown)).toBeGreaterThan(0);
    for (let attempt = 1; attempt < 5; attempt++) {
      await client.connection.del(cooldown);
      await reserve(store, email, ip);
    }
    await client.connection.del(cooldown);
    await expect(reserve(store, email, ip)).rejects.toMatchObject({ code: 'INVITE_RATE_LIMITED' });
    await expect(reserve(randomUUID(), email, ip)).resolves.toBeUndefined();
  });
  it('caps twenty sends per IP across stores and recipient addresses', async () => {
    const ip = randomUUID();
    for (let attempt = 0; attempt < 20; attempt++)
      await reserve(randomUUID(), `${randomUUID()}@example.test`, ip);
    await expect(reserve(randomUUID(), `${randomUUID()}@example.test`, ip)).rejects.toMatchObject({
      code: 'INVITE_RATE_LIMITED',
    });
    await expect(
      reserve(randomUUID(), `${randomUUID()}@example.test`, randomUUID()),
    ).resolves.toBeUndefined();
  });
});
