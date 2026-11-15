import { createHash } from 'node:crypto';
import { permissionAreas, type StoreAccess } from '@dakly/contracts/team';

// This is a consistency tag, never an authorization credential or a store selector.
export function sessionContextTag(
  sessionId: string,
  storeId?: string,
  access?: StoreAccess,
): string {
  const permissions = access
    ? [
        access.role,
        ...permissionAreas.map((area) => access.areas[area] ?? 'none'),
        access.seeFullPhone,
        access.exportLists,
        access.refund,
      ]
    : null;
  return createHash('sha256')
    .update(JSON.stringify([sessionId, storeId ?? null, permissions]))
    .digest('hex');
}
