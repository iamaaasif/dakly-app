import { createHash } from 'node:crypto';
import type { SupportRepository } from './support.repository';
import { supportError } from './support.errors';

export function supportContextTag(tokenHash: Buffer): string {
  return createHash('sha256').update('support-context:').update(tokenHash).digest('hex');
}
export function assertSupportContext(
  expected: string | string[] | undefined,
  current: string,
): void {
  if (expected !== undefined && expected !== current) throw supportError('SUPPORT_CONTEXT_CHANGED');
}
export function assertSupportParent(
  parent: Awaited<ReturnType<SupportRepository['parent']>>,
  now: Date,
): void {
  if (
    !parent ||
    parent.revokedAt ||
    parent.expiresAt <= now ||
    !parent.lastSeenAt ||
    parent.lastSeenAt.getTime() + 1800000 <= now.getTime()
  )
    throw supportError('SUPPORT_ENDED');
}
