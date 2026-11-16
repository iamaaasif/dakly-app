import { randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';

import { toRedisConnection } from '../src/platform/queue/redis-connection';

// Each run queues under its own prefix, so another run or a local worker never takes its jobs.
// Tests that need an empty queue extend it, so removing the prefix's keys removes every test queue.
export function setup() {
  const prefix = `test-${randomUUID()}`;
  process.env.QUEUE_PREFIX = prefix;
  return async () => {
    const redis = new Redis(toRedisConnection(process.env.REDIS_URL!));
    try {
      for await (const keys of redis.scanStream({ match: `${prefix}*`, count: 1000 }))
        if (keys.length) await redis.unlink(...(keys as string[]));
    } finally {
      redis.disconnect();
    }
  };
}
