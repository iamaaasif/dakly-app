import { createHash } from 'node:crypto';

// Tokens are long random values, so a plain digest is enough; short codes use a keyed hash.
export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}
