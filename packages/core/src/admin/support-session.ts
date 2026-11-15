import { createHash } from 'node:crypto';

import { isStaffSessionCurrent } from './staff-session-policy';
import { supportError } from './support.errors';
import type { StaffParentSession } from './support.repository';

export function supportContextTag(tokenHash: Buffer): string {
  return createHash('sha256').update('support-context:').update(tokenHash).digest('hex');
}
export function assertSupportContext(
  expected: string | string[] | undefined,
  current: string,
): void {
  if (expected !== undefined && expected !== current) throw supportError('SUPPORT_CONTEXT_CHANGED');
}
export function assertSupportParent(parent: StaffParentSession | undefined, now: Date): void {
  if (!parent || !isStaffSessionCurrent(parent, now)) throw supportError('SUPPORT_ENDED');
}
