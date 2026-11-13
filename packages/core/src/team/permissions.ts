import { builtInRoles } from '@dakly/contracts/stores';
import {
  permissionAreas,
  type AccessLevel,
  type BuiltInRole,
  type OwnerAction,
  type PermissionArea,
  type StoreAccess,
} from '@dakly/contracts/team';

const levelRanks = { none: 0, view: 1, edit: 2 } as const;
const permissionFlags = ['seeFullPhone', 'exportLists', 'refund'] as const;
const ownerActions: readonly OwnerAction[] = ['billing.edit', 'store.close', 'ownership.transfer'];

export function hasKnownRole(access: StoreAccess): boolean {
  return access.role === 'custom' || builtInRoles.includes(access.role as BuiltInRole);
}

export function canAccess(access: StoreAccess, area: PermissionArea, level: AccessLevel): boolean {
  if (!hasKnownRole(access) || !permissionAreas.includes(area)) return false;
  if (level !== 'view' && level !== 'edit') return false;
  if (area === 'billing' && level === 'edit' && !canDo(access, 'billing.edit')) return false;
  return levelRanks[access.areas[area] ?? 'none'] >= levelRanks[level];
}

export function canDo(access: StoreAccess, ownerAction: OwnerAction): boolean {
  return access.role === 'owner' && ownerActions.includes(ownerAction);
}

export function canGrantRole(grantor: StoreAccess, proposed: StoreAccess): boolean {
  if (!hasKnownRole(grantor) || !hasKnownRole(proposed)) return false;
  if (proposed.role === 'custom' && proposed.areas.billing === 'edit') return false;
  if (canDo(proposed, 'ownership.transfer') && !canDo(grantor, 'ownership.transfer')) return false;
  const grantsOnlyOwnedAreas = permissionAreas.every((area) => {
    const level = proposed.areas[area] ?? 'none';
    return level === 'none' || canAccess(grantor, area, level);
  });
  return grantsOnlyOwnedAreas && permissionFlags.every((flag) => !proposed[flag] || grantor[flag]);
}
