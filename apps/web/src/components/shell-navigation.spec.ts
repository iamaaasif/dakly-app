import { describe, expect, it } from 'vitest';

import type { SessionContext } from '@dakly/contracts/sessions';

import { currentState, navigationGroups } from './shell-navigation';

const settings = {
  href: '/settings',
  related: ['/security', '/team/ownership', '/support-access'],
};
const storeSettings = { href: '/settings?tab=store' };
const extensions = { href: '/settings?tab=extensions' };
const team = { href: '/team' };
const orders = { href: '/orders' };
const products = { href: '/products' };

describe('currentState', () => {
  it('marks Settings as the page on /settings without a tab', () => {
    expect(currentState(settings, '/settings', null)).toBe('page');
    expect(currentState(storeSettings, '/settings', null)).toBeUndefined();
  });
  it('marks the tab link as the page and Settings as the location on a tab', () => {
    expect(currentState(storeSettings, '/settings', 'store')).toBe('page');
    expect(currentState(settings, '/settings', 'store')).toBe('location');
    expect(currentState(extensions, '/settings', 'extensions')).toBe('page');
  });
  it('marks Settings as the location on the screens it leads to', () => {
    expect(currentState(settings, '/security', null)).toBe('location');
    expect(currentState(team, '/team/ownership', null)).toBeUndefined();
  });
  it('marks Orders as current on /orders', () => {
    expect(currentState(orders, '/orders', null)).toBe('page');
    expect(currentState(products, '/orders', null)).toBeUndefined();
  });
  it('marks Products as current on /products', () => {
    expect(currentState(products, '/products', null)).toBe('page');
    expect(currentState(orders, '/products', null)).toBeUndefined();
  });
});

describe('navigationGroups', () => {
  function makeSession(permissions: {
    canViewOrders?: boolean;
    canViewProducts?: boolean;
  }): SessionContext {
    return {
      user: { id: 'user-1', name: 'Test User' },
      hasMemberships: true,
      currentStore: {
        storeId: 'store-1',
        name: 'Dhaka Threads',
        canViewProducts: permissions.canViewProducts ?? false,
        canEditProducts: false,
        canViewOrders: permissions.canViewOrders ?? false,
        canEditOrders: false,
        canViewCampaigns: false,
        canEditCampaigns: false,
        canViewCustomers: true,
        canCreateCustomer: false,
        canViewSegments: true,
        canEditSegments: false,
        canApproveSupport: false,
        canViewStoreSettings: true,
        canEditStoreSettings: false,
        canChangeExtensions: false,
        canViewTeam: true,
        canEditTeam: false,
        canTransferOwnership: false,
      },
      contextTag: 'tag-1',
    };
  }

  it('includes Sales group with Orders and Products in the design order when both permitted', () => {
    const groups = navigationGroups(makeSession({ canViewOrders: true, canViewProducts: true }));
    const sales = groups.find((group) => group.heading === 'Sales');
    expect(sales).toBeDefined();
    expect(
      sales?.links.map((link) => ({ href: link.href, label: link.label, visible: link.visible })),
    ).toEqual([
      { href: '/orders', label: 'Orders', visible: true },
      { href: '/products', label: 'Products', visible: true },
    ]);
  });

  it('shows only Orders when canViewOrders is true and canViewProducts is false', () => {
    const groups = navigationGroups(makeSession({ canViewOrders: true, canViewProducts: false }));
    const sales = groups.find((group) => group.heading === 'Sales');
    expect(sales?.links.filter((link) => link.visible).map((link) => link.label)).toEqual([
      'Orders',
    ]);
  });

  it('shows only Products when canViewProducts is true and canViewOrders is false', () => {
    const groups = navigationGroups(makeSession({ canViewOrders: false, canViewProducts: true }));
    const sales = groups.find((group) => group.heading === 'Sales');
    expect(sales?.links.filter((link) => link.visible).map((link) => link.label)).toEqual([
      'Products',
    ]);
  });

  it('marks both as not visible when neither is permitted', () => {
    const groups = navigationGroups(makeSession({ canViewOrders: false, canViewProducts: false }));
    const sales = groups.find((group) => group.heading === 'Sales');
    expect(sales?.links.every((link) => !link.visible)).toBe(true);
  });
});
