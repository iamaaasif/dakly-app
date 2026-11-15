import { describe, expect, it } from 'vitest';

import { toRedisConnection } from './redis-connection';

describe('toRedisConnection', () => {
  it('reads a local URL', () => {
    expect(toRedisConnection('redis://localhost:6379')).toEqual({ host: 'localhost', port: 6379 });
  });

  it.each([
    ['redis://localhost/0', 0],
    ['redis://localhost/15', 15],
  ])('keeps the database in %s', (url, db) => {
    expect(toRedisConnection(url)).toEqual({ host: 'localhost', port: 6379, db });
  });

  it.each([
    'redis://localhost/-1',
    'redis://localhost/1.5',
    'redis://localhost/abc',
    'redis://localhost/1/2',
    'redis://localhost/9007199254740992',
    'https://localhost:6379',
  ])('rejects unsupported Redis URL %s', (url) => {
    expect(() => toRedisConnection(url)).toThrow();
  });

  it('enables TLS and credentials for a managed rediss URL', () => {
    expect(toRedisConnection('rediss://us%40er:s%40cret@db.example.com:25061/2')).toEqual({
      host: 'db.example.com',
      port: 25061,
      db: 2,
      username: 'us@er',
      password: 's@cret',
      tls: {},
    });
  });
});
