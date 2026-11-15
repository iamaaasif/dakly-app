import type { SupportGrantResponse } from '@dakly/contracts/support';

import { MINUTE_MS } from '../platform/time';
import type { SupportRepository } from './support.repository';

const SUPPORT_REQUEST_TTL_MS = 30 * MINUTE_MS;
type Grant = NonNullable<Awaited<ReturnType<SupportRepository['find']>>>;
export function supportGrantStatus(grant: Grant, now: Date) {
  return (grant.status === 'requested' &&
    grant.requestedAt.getTime() + SUPPORT_REQUEST_TTL_MS <= now.getTime()) ||
    (grant.status === 'approved' && (!grant.expiresAt || grant.expiresAt <= now))
    ? 'expired'
    : grant.status;
}
export function supportGrantResponse(grant: Grant, now: Date): SupportGrantResponse {
  return {
    id: grant.id,
    staffName: grant.staffName,
    isBreakGlass: grant.isBreakGlass,
    scopes: grant.scopes,
    access: grant.access,
    status: supportGrantStatus(grant, now),
    reason: grant.reason,
    durationMinutes: grant.durationMinutes,
    requestedAt: grant.requestedAt.toISOString(),
    expiresAt: grant.expiresAt?.toISOString() ?? null,
  };
}
