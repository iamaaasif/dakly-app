import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it.each(['https://localhost:6379', 'redis://localhost/-1', 'redis://localhost/1.5'])(
    'rejects unsupported REDIS_URL at startup: %s',
    (redisUrl) => {
      expect(() =>
        loadEnv({ DATABASE_URL: 'postgres://localhost/dakly', REDIS_URL: redisUrl }),
      ).toThrow();
    },
  );
});
