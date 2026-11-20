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
});

describe('navigationGroups', () => {
  function makeSession(permissions: {
    canViewOrders?: boolean;
    canViewProducts?: boolean;
    canViewSocial?: boolean;
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
        canViewAnalytics: false,
        canEditCampaigns: false,
        canViewSocial: permissions.canViewSocial ?? false,
        canEditSocial: false,
        canViewAutomations: false,
        canEditAutomations: false,
        canViewCustomers: true,
        canCreateCustomer: false,
        canViewChats: true,
        canEditChats: true,
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

  it.each([
    [{ canViewOrders: true, canViewProducts: false }, ['Orders']],
    [{ canViewOrders: false, canViewProducts: true }, ['Products']],
    [{ canViewOrders: false, canViewProducts: false }, []],
  ])('shows visible Sales links for %o', (permissions, expected) => {
    const groups = navigationGroups(makeSession(permissions));
    const sales = groups.find((group) => group.heading === 'Sales');
    const visible = sales?.links.filter((link) => link.visible).map((link) => link.label) ?? [];
    expect(visible).toEqual(expected);
  });

  it('places Sales between Customers and Store information', () => {
    const groups = navigationGroups(makeSession({ canViewOrders: true, canViewProducts: true }));
    expect(groups.map((group) => group.heading)).toEqual([
      'Workspace',
      'Customers',
      'Sales',
      'Marketing',
      'Social auto post',
      'Intelligence',
      'Store information',
      'Configuration',
    ]);
  });

  it('shows the Social hub, My posts and Content Studio only to people who can view social posts', () => {
    const links = (canViewSocial: boolean) =>
      navigationGroups(makeSession({ canViewSocial }))
        .find((group) => group.heading === 'Social auto post')
        ?.links.filter((link) => link.visible)
        .map((link) => link.href);
    expect(links(true)).toEqual(['/social', '/social/posts', '/content-studio']);
    expect(links(false)).toEqual([]);
  });

  it('handles session without active store', () => {
    const groups = navigationGroups({
      user: { id: 'user-1', name: 'Test User' },
      hasMemberships: false,
      currentStore: null,
      contextTag: 'tag-1',
    });
    const sales = groups.find((group) => group.heading === 'Sales');
    expect(sales?.links.every((link) => !link.visible)).toBe(true);
  });
});
