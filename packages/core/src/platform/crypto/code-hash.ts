import { createHmac } from 'node:crypto';

// Short codes need a server secret: a plain digest of a six-digit code is reversed offline in seconds.
export function hashCode(key: string | undefined, code: string): string {
  if (!key) throw new Error('Code hash key is required');
  return createHmac('sha256', Buffer.from(key, 'base64')).update(code).digest('hex');
}
