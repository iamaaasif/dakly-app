import { describe, expect, it } from 'vitest';

import type { SessionContext } from '@dakly/contracts/sessions';

import { currentState, navigationGroups } from './shell-navigation';

const settings = {
  href: '/settings',
  related: ['/security', '/team/ownership', '/support-access'],
};
const storeSettings = { href: '/settings?tab=store' };
const extensions = { href: '/extensions' };
const team = { href: '/team' };

describe('currentState', () => {
  it('keeps a link with nested screens highlighted on them', () => {
    const products = { href: '/products', nested: true };
    expect(currentState(products, '/products/new', new URLSearchParams())).toBe('page');
    expect(currentState(products, '/products/abc', new URLSearchParams())).toBe('page');
    expect(currentState(products, '/productsx', new URLSearchParams())).toBeUndefined();
    expect(currentState(team, '/team/ownership', new URLSearchParams())).toBeUndefined();
  });
  it('marks Settings as the page on /settings without a tab', () => {
    expect(currentState(settings, '/settings', new URLSearchParams())).toBe('page');
    expect(currentState(storeSettings, '/settings', new URLSearchParams())).toBeUndefined();
  });
  it('marks the tab link as the page and Settings as the location on a tab', () => {
    expect(currentState(storeSettings, '/settings', new URLSearchParams('tab=store'))).toBe('page');
    expect(currentState(settings, '/settings', new URLSearchParams('tab=store'))).toBe('location');
  });
  it('marks a link with a query as the page only when the screen has that query', () => {
    const agent = { href: '/chats?agent=settings' };
    const chats = { href: '/chats' };
    expect(currentState(agent, '/chats', new URLSearchParams('agent=settings'))).toBe('page');
    expect(currentState(agent, '/chats', new URLSearchParams())).toBeUndefined();
    expect(currentState(chats, '/chats', new URLSearchParams())).toBe('page');
  });
  it('marks Extensions as the page on its own route', () => {
    expect(currentState(extensions, '/extensions', new URLSearchParams())).toBe('page');
  });
  it('marks Settings as the location on the screens it leads to', () => {
    expect(currentState(settings, '/security', new URLSearchParams())).toBe('location');
    expect(currentState(team, '/team/ownership', new URLSearchParams())).toBeUndefined();
  });
});

describe('navigationGroups', () => {
  function makeSession(permissions: {
    canViewOrders?: boolean;
    canViewProducts?: boolean;
    canViewSocial?: boolean;
    canViewDueBook?: boolean;
    canViewCampaigns?: boolean;
    canViewAutomations?: boolean;
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
        canExportOrders: false,
        canPrintShippingLabels: false,
        canViewDueBook: permissions.canViewDueBook ?? false,
        canEditDueBook: false,
        canViewCampaigns: permissions.canViewCampaigns ?? false,
        canViewAnalytics: false,
        canChangeAttributionWindow: false,
        canEditCampaigns: false,
        canViewSocial: permissions.canViewSocial ?? false,
        canEditSocial: false,
        canViewAutomations: permissions.canViewAutomations ?? false,
        canEditAutomations: false,
        canViewCustomers: true,
        canCreateCustomer: false,
        canExportCustomers: false,
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
      'Physical shop',
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

  it('lists Automations after Campaigns under Marketing only to people who can view automations', () => {
    const links = (permissions: Parameters<typeof makeSession>[0]) =>
      navigationGroups(makeSession(permissions))
        .find((group) => group.heading === 'Marketing')
        ?.links.filter((link) => link.visible)
        .map((link) => link.href);
    expect(links({ canViewCampaigns: true, canViewAutomations: true })).toEqual([
      '/campaigns',
      '/automations',
    ]);
    expect(links({ canViewCampaigns: true })).toEqual(['/campaigns']);
    expect(links({ canViewAutomations: true })).toEqual(['/automations']);
  });

  it('shows Due book under Physical shop only to people who can view it', () => {
    const links = (canViewDueBook: boolean) =>
      navigationGroups(makeSession({ canViewDueBook }))
        .find((group) => group.heading === 'Physical shop')
        ?.links.filter((link) => link.visible)
        .map((link) => link.href);
    expect(links(true)).toEqual(['/due-book']);
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
