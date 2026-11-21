import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ValkeyClient } from '../platform/cache/valkey-client';
import { loadEnv } from '../platform/config/env';
import { AiGate } from './ai-gate';

describe('AiGate', () => {
  const valkey = new ValkeyClient(loadEnv().REDIS_URL);
  let now = Date.now();
  const gate = new AiGate(valkey, { now: () => new Date(now) });

  beforeAll(async () => valkey.onModuleInit());
  afterAll(() => valkey.onApplicationShutdown());
  // The gate is shared by every test in the run. Other specs make model calls fail, which can
  // leave it paused, so each test starts from an empty gate.
  beforeEach(async () => {
    const keys = await valkey.connection.keys(`${loadEnv().QUEUE_PREFIX}:{ai}*`);
    if (keys.length > 0) await valkey.connection.del(...keys);
  });

  it('allows three simultaneous calls in one store and leaves other stores alone', async () => {
    const storeId = randomUUID();
    const results = await Promise.all(Array.from({ length: 4 }, () => gate.acquire(storeId)));
    expect(results.filter(({ kind }) => kind === 'acquired')).toHaveLength(3);
    expect(results.filter(({ kind }) => kind === 'busy')).toHaveLength(1);
    expect((await gate.acquire(randomUUID())).kind).toBe('acquired');

    const permit = results.find((result) => result.kind === 'acquired');
    if (permit?.kind !== 'acquired') throw new Error('Missing permit');
    await gate.release(storeId, permit.ticket);
    expect((await gate.acquire(storeId)).kind).toBe('acquired');
  });

  it('gives a store new permits after a worker leaves its lease behind', async () => {
    const storeId = randomUUID();
    await Promise.all(Array.from({ length: 3 }, () => gate.acquire(storeId)));
    expect((await gate.acquire(storeId)).kind).toBe('busy');

    now += 26_000;
    expect((await gate.acquire(storeId)).kind).toBe('acquired');
  });

  it('pauses across stores for two minutes only after three recent errors', async () => {
    await gate.recordFailure();
    now += 59_000;
    await gate.recordFailure();
    now += 2_000;
    await gate.recordFailure();
    expect((await gate.acquire(randomUUID())).kind).toBe('acquired');

    await gate.recordFailure();
    expect(await gate.acquire(randomUUID())).toEqual({ kind: 'paused' });
    const pauseKey = `${loadEnv().QUEUE_PREFIX}:{ai}:paused`;
    const pauseMs = await valkey.connection.pttl(pauseKey);
    expect(pauseMs).toBeGreaterThan(119_000);
    expect(pauseMs).toBeLessThanOrEqual(120_000);
  });
});
