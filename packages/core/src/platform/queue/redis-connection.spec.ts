import { describe, expect, it } from 'vitest';
import { toRedisConnection } from './redis-connection';

describe('toRedisConnection', () => {
  it('reads a local URL', () => {
    expect(toRedisConnection('redis://localhost:6379')).toEqual({ host: 'localhost', port: 6379 });
  });

  it('enables TLS and credentials for a managed rediss URL', () => {
    expect(toRedisConnection('rediss://default:s%40cret@db.example.com:25061')).toEqual({
      host: 'db.example.com',
      port: 25061,
      username: 'default',
      password: 's@cret',
      tls: {},
    });
  });
});
