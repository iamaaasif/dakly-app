// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Dashboard } from './dashboard';

const session = vi.hoisted(() => ({
  user: { name: 'Rina Akter' },
  currentStore: {
    canViewAnalytics: true,
    canViewOrders: true,
    canViewChats: true,
    canEditChats: true,
    canEditOrders: true,
    canCreateCustomer: true,
    canEditCampaigns: false,
    canEditSocial: false,
  },
}));

vi.mock('@/lib/session-context', () => ({
  useSessionContext: () => ({ data: session }),
}));

vi.mock('../api/dashboard', () => ({
  useDashboard: () => ({
    data: {
      asOf: '2026-11-25T04:00:00Z',
      timeZone: 'Asia/Dhaka',
      cards: {
        sales: {
          totalPoisha: '950000',
          previousPoisha: '900000',
          pointsPoisha: ['125000', '85000'],
        },
      },
    },
  }),
}));

afterEach(cleanup);

describe('Dashboard', () => {
  it('puts the shop overview and available shortcuts on the dashboard', () => {
    render(<Dashboard period={30} setupCard={null} />);
    expect(screen.getByRole('heading', { name: 'Good morning, Rina' })).toBeTruthy();
    const overview = screen.getByRole('region', { name: 'Shop overview' });
    expect(within(overview).getByText('৳2,100 in sales since yesterday.')).toBeTruthy();
    const shortcuts = screen.getByRole('region', { name: 'Quick actions' });
    expect(
      within(shortcuts).getByRole('link', { name: 'Order management' }).getAttribute('href'),
    ).toBe('/orders');
    expect(within(shortcuts).queryByRole('link', { name: 'Create campaign' })).toBeNull();
    expect(within(shortcuts).queryByRole('link', { name: 'AI auto social post' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Reports' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Reporting period' })).toBeNull();
  });

  it('shows live work that needs attention and links to the matching queues', () => {
    render(
      <Dashboard
        period={30}
        setupCard={null}
        activity={{ chatsWaiting: 2, ordersToConfirm: 1, ordersToPack: 3 }}
      />,
    );
    const tasks = screen.getByRole('region', { name: 'Your to-do list' });
    expect(within(tasks).getByText('Reply to 2 customers')).toBeTruthy();
    expect(within(tasks).getByText('Confirm 1 order')).toBeTruthy();
    expect(within(tasks).getByText('Pack 3 orders')).toBeTruthy();
    expect(within(tasks).getByRole('link', { name: 'Review' }).getAttribute('href')).toBe(
      '/orders?stage=to_confirm',
    );
  });
  it('keeps actionable tasks from members with view-only access', () => {
    const readOnly = { ...session.currentStore, canEditChats: false, canEditOrders: false };
    const previous = session.currentStore;
    session.currentStore = readOnly;
    try {
      render(
        <Dashboard
          period={30}
          setupCard={null}
          activity={{ chatsWaiting: 2, ordersToConfirm: 1, ordersToPack: 3 }}
        />,
      );
      const tasks = screen.getByRole('region', { name: 'Your to-do list' });
      expect(within(tasks).queryByRole('link', { name: 'Open chats' })).toBeNull();
      expect(within(tasks).queryByRole('link', { name: 'Review' })).toBeNull();
      expect(screen.getByRole('link', { name: /New orders/ })).toBeTruthy();
    } finally {
      session.currentStore = previous;
    }
  });
});
