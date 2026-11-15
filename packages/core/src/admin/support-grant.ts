import type { SupportGrantResponse } from '@dakly/contracts/support';

import { MINUTE_MS } from '../platform/time';
import type { SupportGrantRow } from './support.repository';

const SUPPORT_REQUEST_TTL_MS = 30 * MINUTE_MS;
export function supportGrantStatus(grant: SupportGrantRow, now: Date) {
  if (
    grant.status === 'requested' &&
    grant.requestedAt.getTime() + SUPPORT_REQUEST_TTL_MS <= now.getTime()
  )
    return 'expired';
  if (grant.status === 'approved' && (!grant.expiresAt || grant.expiresAt <= now)) return 'expired';
  return grant.status;
}
export function supportGrantResponse(grant: SupportGrantRow, now: Date): SupportGrantResponse {
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
