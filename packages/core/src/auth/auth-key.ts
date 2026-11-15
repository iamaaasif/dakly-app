import { createHash } from 'node:crypto';

export function authKey(kind: string, value: string): string {
  return `auth:${kind}:${createHash('sha256').update(value).digest('hex')}`;
}
