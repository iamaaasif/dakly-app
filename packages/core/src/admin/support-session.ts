import type { Clock } from '../platform/clock';
import type { SupportAuditService } from './support-audit.service';
import type { StaffIdentityService } from './staff-identity.service';
import type { SupportPrincipal } from '@dakly/contracts/support';
import type { StoreTransaction } from '../platform/database/store-transaction';
import { isStaffSessionCurrent } from './staff-session-policy';
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
  if (!parent || !isStaffSessionCurrent(parent, now)) throw supportError('SUPPORT_ENDED');
}

export async function runSupportSession<T>(
  repository: SupportRepository,
  transaction: StoreTransaction,
  token: string | undefined,
  work: (principal: SupportPrincipal, contextTag: string) => Promise<T>,
  readOnly = false,
) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw supportError('SUPPORT_ENDED');
  const hash = createHash('sha256').update(token).digest();
  const storeId = await repository.locate(hash, false);
  if (!storeId) throw supportError('SUPPORT_ENDED');
  const transact = readOnly
    ? transaction.run.bind(transaction)
    : transaction.runLocked.bind(transaction);
  const result = await transact(storeId, async () => {
    const session = readOnly
      ? await repository.readSession(storeId, hash)
      : await repository.session(storeId, hash, false);
    if (!session) throw supportError('SUPPORT_ENDED');
    return work(session, supportContextTag(hash));
  });
  // Denial audit must commit before sending the permission error.
  if (result === null) throw supportError('SUPPORT_DENIED');
  return result;
}

export async function assertSupportStaff(
  repository: SupportRepository,
  identities: StaffIdentityService,
  storeId: string,
  staffUserId: string,
  sessionId: string | undefined,
  clock: Clock,
  readOnly = false,
) {
  const staff = readOnly
    ? await repository.readStaff(storeId, staffUserId)
    : await repository.staff(storeId, staffUserId);
  if (
    !staff ||
    staff.status !== 'active' ||
    !staff.enrolledAt ||
    !['super_admin', 'support', 'trust_safety'].includes(staff.role)
  )
    throw supportError('SUPPORT_ENDED');
  if (sessionId)
    assertSupportParent(
      readOnly
        ? await repository.readParent(storeId, staffUserId, sessionId)
        : await repository.parent(storeId, staffUserId, sessionId),
      clock.now(),
    );
  if (await identities.conflictsWithStore(storeId, staffUserId))
    throw supportError('SUPPORT_DENIED');
  return staff;
}

export async function denySupportAction(
  audit: SupportAuditService,
  principal: SupportPrincipal,
  ip: string,
) {
  await audit.record(
    principal.storeId,
    principal.grantId,
    { kind: 'staff', staffUserId: principal.staffUserId },
    'support.action_denied',
    'Support scope denied the requested action',
    ip,
  );
  return null;
}
