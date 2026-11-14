import { describe, expect, it } from 'vitest';
import type { AccessLevel, PermissionArea, StoreAccess } from '@dakly/contracts/team';
import { builtInRoleAccess } from './built-in-roles';
import { canAccess, canDo, canGrantRole, canManageMember } from './permissions';

const expectedAreas = [
  ['dashboard', 'view', 'view', 'view', 'view'],
  ['chats', 'edit', 'edit', 'none', 'edit'],
  ['customers', 'edit', 'edit', 'edit', 'view'],
  ['segments', 'edit', 'edit', 'edit', 'view'],
  ['orders', 'edit', 'edit', 'none', 'edit'],
  ['products', 'edit', 'edit', 'view', 'view'],
  ['campaigns', 'edit', 'edit', 'edit', 'none'],
  ['automations', 'edit', 'edit', 'edit', 'none'],
  ['social', 'edit', 'edit', 'edit', 'none'],
  ['analytics', 'edit', 'edit', 'view', 'none'],
  ['storeSettings', 'edit', 'edit', 'none', 'none'],
  ['team', 'edit', 'edit', 'none', 'none'],
  ['billing', 'edit', 'view', 'none', 'none'],
  ['shopSales', 'edit', 'edit', 'none', 'none'],
  ['dueBook', 'edit', 'edit', 'none', 'none'],
] as const;
const roleColumns = ['owner', 'admin', 'marketer', 'support_agent'] as const;
const roleAreas = expectedAreas.flatMap(([area, ...levels]) =>
  roleColumns.map((role, index) => ({ role, area, expected: levels[index]! })),
);
const customAccess: StoreAccess = {
  role: 'custom',
  areas: { customers: 'view', billing: 'view' },
  seeFullPhone: false,
  exportLists: false,
  refund: false,
};

describe('permission policy', () => {
  it('never assigns or changes Owner through ordinary membership management', () => {
    expect(canManageMember(builtInRoleAccess.owner, builtInRoleAccess.owner)).toBe(false);
    expect(canManageMember(builtInRoleAccess.admin, builtInRoleAccess.owner)).toBe(false);
    expect(
      canManageMember(builtInRoleAccess.owner, builtInRoleAccess.admin, builtInRoleAccess.owner),
    ).toBe(false);
    expect(canManageMember(builtInRoleAccess.admin, builtInRoleAccess.marketer)).toBe(true);
    expect(canManageMember(builtInRoleAccess.marketer, builtInRoleAccess.support_agent)).toBe(
      false,
    );
    expect(
      canManageMember(
        { ...builtInRoleAccess.admin, seeFullPhone: false },
        builtInRoleAccess.marketer,
        builtInRoleAccess.admin,
      ),
    ).toBe(false);
  });
  it.each(roleAreas)('$role has $expected access to $area', ({ role, area, expected }) => {
    expect(canAccess(builtInRoleAccess[role], area, 'view')).toBe(expected !== 'none');
    expect(canAccess(builtInRoleAccess[role], area, 'edit')).toBe(expected === 'edit');
  });

  it.each([
    ['owner', true],
    ['admin', true],
    ['marketer', false],
    ['support_agent', false],
  ] as const)('gives %s the expected privacy and refund flags', (role, enabled) => {
    expect(builtInRoleAccess[role]).toMatchObject({
      seeFullPhone: enabled,
      exportLists: enabled,
      refund: enabled,
    });
  });

  it('uses custom area levels and denies unspecified areas', () => {
    expect(canAccess(customAccess, 'customers', 'view')).toBe(true);
    expect(canAccess(customAccess, 'customers', 'edit')).toBe(false);
    expect(canAccess(customAccess, 'orders', 'view')).toBe(false);
  });

  it.each(['billing.edit', 'store.close', 'ownership.transfer'] as const)(
    'reserves %s for the Owner regardless of stored permissions',
    (action) => {
      expect(canDo(builtInRoleAccess.owner, action)).toBe(true);
      expect(canDo(builtInRoleAccess.admin, action)).toBe(false);
      expect(canDo({ ...customAccess, areas: { billing: 'edit' } }, action)).toBe(false);
    },
  );

  it('denies billing edits even when custom JSON grants them', () => {
    const forged = { ...customAccess, areas: { billing: 'edit' as const } };
    expect(canAccess(forged, 'billing', 'view')).toBe(true);
    expect(canAccess(forged, 'billing', 'edit')).toBe(false);
  });

  it('fails closed for unknown roles even with all permission flags', () => {
    const unknown = { ...builtInRoleAccess.owner, role: 'unknown' } as StoreAccess;
    expect(canAccess(unknown, 'orders', 'view')).toBe(false);
    expect(canDo(unknown, 'store.close')).toBe(false);
    expect(canGrantRole(unknown, customAccess)).toBe(false);
    expect(canGrantRole(builtInRoleAccess.owner, unknown)).toBe(false);
  });

  it('never grants an unknown area, level, or Owner action', () => {
    expect(canAccess(builtInRoleAccess.owner, 'unknown' as PermissionArea, 'view')).toBe(false);
    expect(canAccess(builtInRoleAccess.owner, 'orders', 'delete' as AccessLevel)).toBe(false);
    expect(canDo(builtInRoleAccess.owner, 'unknown' as 'store.close')).toBe(false);
  });

  it('allows a member to grant only a subset of their own access', () => {
    expect(canGrantRole(builtInRoleAccess.admin, builtInRoleAccess.marketer)).toBe(true);
    expect(canGrantRole(customAccess, { ...customAccess, areas: { customers: 'view' } })).toBe(
      true,
    );
    expect(canGrantRole(customAccess, { ...customAccess, areas: { customers: 'edit' } })).toBe(
      false,
    );
    expect(canGrantRole(customAccess, { ...customAccess, areas: { orders: 'view' } })).toBe(false);
    expect(canGrantRole(builtInRoleAccess.admin, builtInRoleAccess.owner)).toBe(false);
  });

  it.each(['seeFullPhone', 'exportLists', 'refund'] as const)(
    'rejects granting %s when the granting member lacks it',
    (flag) => {
      const limitedAdmin = { ...builtInRoleAccess.admin, [flag]: false };
      expect(canGrantRole(limitedAdmin, { ...customAccess, [flag]: true })).toBe(false);
      expect(canGrantRole(builtInRoleAccess.admin, { ...customAccess, [flag]: true })).toBe(true);
    },
  );

  it('rejects invalid custom billing levels even when the grantor is Owner', () => {
    expect(
      canGrantRole(builtInRoleAccess.owner, {
        ...customAccess,
        areas: { billing: 'edit' },
      }),
    ).toBe(false);
  });

  it('rejects delegating Owner authority through reduced area levels', () => {
    expect(
      canGrantRole(builtInRoleAccess.admin, {
        ...customAccess,
        role: 'owner',
      }),
    ).toBe(false);
  });
});
