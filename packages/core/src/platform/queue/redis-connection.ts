import { z } from 'zod';

export const redisUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return (
    ['redis:', 'rediss:'].includes(url.protocol) &&
    (url.pathname === '' || url.pathname === '/' || /^\/\d+$/.test(url.pathname)) &&
    Number.isSafeInteger(Number(url.pathname.slice(1)))
  );
}, 'Enter a redis:// or rediss:// URL with a non-negative database number');

// BullMQ takes ioredis options, not a URL. DigitalOcean managed Valkey uses rediss:// (TLS).
export type RedisConnection = {
  host: string;
  port: number;
  db?: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
};

export function toRedisConnection(redisUrl: string): RedisConnection {
  const url = new URL(redisUrlSchema.parse(redisUrl));
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.pathname.length > 1 && { db: Number(url.pathname.slice(1)) }),
    ...(url.username && { username: decodeURIComponent(url.username) }),
    ...(url.password && { password: decodeURIComponent(url.password) }),
    ...(url.protocol === 'rediss:' && { tls: {} }),
  };
}
