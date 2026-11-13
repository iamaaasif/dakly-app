import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CacheModule } from './cache.module';
import { RateLimiter } from './rate-limiter';
import { ValkeyClient } from './valkey-client';

describe('RateLimiter (Valkey)', () => {
  let application: INestApplicationContext;
  let client: ValkeyClient;
  let limiter: RateLimiter;
  const keys: string[] = [];
  const key = () => {
    const value = `api-2-test:${randomUUID()}`;
    keys.push(value);
    return value;
  };

  beforeAll(async () => {
    application = await NestFactory.createApplicationContext(CacheModule, {
      logger: false,
      abortOnError: false,
    });
    client = application.get(ValkeyClient);
    limiter = application.get(RateLimiter);
  });

  afterAll(async () => {
    if (client && keys.length > 0) await client.connection.del(...keys);
    if (application) await application.close();
  });

  it('refuses the sixth call and returns the remaining seconds without extending the window', async () => {
    const accountKey = key();
    expect(await limiter.consume(accountKey, 5, 60)).toEqual({ allowed: true, retryAfter: 0 });
    // A known remaining TTL catches a limiter that resets expiry on each attempt.
    await client.connection.pexpire(accountKey, 25_000);
    for (let attempt = 1; attempt < 5; attempt++) {
      expect(await limiter.consume(accountKey, 5, 60)).toEqual({ allowed: true, retryAfter: 0 });
    }

    expect(await limiter.consume(accountKey, 5, 60)).toEqual({ allowed: false, retryAfter: 25 });
    expect(await client.connection.pttl(accountKey)).toBeGreaterThan(0);
    expect(await client.connection.pttl(accountKey)).toBeLessThanOrEqual(25_000);
  });

  it('allows exactly five of twenty parallel calls sharing a key', async () => {
    const accountKey = key();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => limiter.consume(accountKey, 5, 60)),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    expect(results.filter((result) => !result.allowed)).toHaveLength(15);
  });

  it('counts two keys independently', async () => {
    const firstKey = key();
    const secondKey = key();
    await limiter.consume(firstKey, 1, 60);

    expect(await limiter.consume(firstKey, 1, 60)).toEqual({ allowed: false, retryAfter: 60 });
    expect(await limiter.consume(secondKey, 1, 60)).toEqual({ allowed: true, retryAfter: 0 });
  });

  it('opens a new window after the original window expires', async () => {
    const accountKey = key();
    await limiter.consume(accountKey, 1, 1);
    expect(await limiter.consume(accountKey, 1, 1)).toEqual({ allowed: false, retryAfter: 1 });

    await setTimeout(1100);

    expect(await limiter.consume(accountKey, 1, 1)).toEqual({ allowed: true, retryAfter: 0 });
    expect(await limiter.consume(accountKey, 1, 1)).toEqual({ allowed: false, retryAfter: 1 });
  });
});
