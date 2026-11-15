import {
  permissionAreas,
  type AccessLevel,
  type BuiltInRole,
  type PermissionArea,
  type StoreAccess,
} from '@dakly/contracts/team';

const editableAreas = Object.fromEntries(permissionAreas.map((area) => [area, 'edit'])) as Record<
  PermissionArea,
  AccessLevel
>;

function builtInAccess(role: BuiltInRole, areas: StoreAccess['areas'], flags = false): StoreAccess {
  return {
    role,
    areas: { ...areas, dashboard: 'view' },
    seeFullPhone: flags,
    exportLists: flags,
    refund: flags,
  };
}

export const builtInRoleAccess: Record<BuiltInRole, StoreAccess> = {
  owner: builtInAccess('owner', editableAreas, true),
  admin: builtInAccess('admin', { ...editableAreas, billing: 'view' }, true),
  marketer: builtInAccess('marketer', {
    customers: 'edit',
    segments: 'edit',
    campaigns: 'edit',
    automations: 'edit',
    social: 'edit',
    analytics: 'view',
    products: 'view',
  }),
  support_agent: builtInAccess('support_agent', {
    chats: 'edit',
    orders: 'edit',
    customers: 'view',
    segments: 'view',
    products: 'view',
  }),
};
