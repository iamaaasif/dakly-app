// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnalyticsOverviewResponse, AnalyticsView } from '@dakly/contracts/analytics';
import type { SessionContext } from '@dakly/contracts/sessions';

import { AnalyticsScreen } from './analytics-screen';
import { sessionContextKey } from '@/lib/session-context';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const overview: AnalyticsOverviewResponse = {
  asOf: '2026-11-20T06:00:00.000Z',
  timeZone: 'Asia/Dhaka',
  current: { from: '2026-10-22', through: '2026-11-20' },
  previous: { from: '2026-09-22', through: '2026-10-21' },
  marketing: {
    revenue: { currentPoisha: '51512400', previousPoisha: '41800000' },
    orders: { current: 277, previous: 231 },
    dailyRevenuePoisha: ['100', '300', '200'],
  },
  messages: {
    sent: { current: 9182, previous: 7100 },
    deliveredPercent: 98.3,
    tappedPeople: { current: 1250, previous: 1000 },
    tapPercent: 13.8,
    cost: { currentPoisha: '873900', previousPoisha: '700000' },
  },
  returnPerTaka: 59,
  weeklyRevenue: [
    { weekStart: '2026-10-22', byChannel: { whatsapp: '30000000', sms: '10000000' } },
    { weekStart: '2026-10-29', byChannel: { whatsapp: '5000000' } },
  ],
  previousWeeklyRevenuePoisha: ['20000000', '15000000'],
  channels: [
    {
      channel: 'whatsapp',
      sent: 3000,
      deliveredPercent: 99,
      costPoisha: '500000',
      revenuePoisha: '34575000',
    },
    {
      channel: 'sms',
      sent: 6182,
      deliveredPercent: 98,
      costPoisha: '373900',
      revenuePoisha: '13710000',
    },
    { channel: 'messenger', sent: 0, deliveredPercent: null, costPoisha: '0', revenuePoisha: '0' },
  ],
  funnel: {
    sent: { count: 9182, percentOfPrevious: null },
    delivered: { count: 9026, percentOfPrevious: 98.3 },
    read: { count: 7172, percentOfPrevious: 79.5 },
    tapped: { count: 1250, percentOfPrevious: 13.8 },
    ordered: { count: 277, percentOfPrevious: 22.2 },
  },
};

function show(view: Partial<AnalyticsView> = {}) {
  vi.stubGlobal('fetch', async () =>
    Response.json(overview, { headers: { 'x-session-context': 'verified' } }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    user: { id: 'member', name: 'Member' },
    currentStore: { storeId: 'shop', name: 'Shop', canViewAnalytics: true },
    contextTag: 'verified',
    hasMemberships: true,
  } as unknown as SessionContext);
  render(
    <QueryClientProvider client={client}>
      <AnalyticsScreen view={{ tab: 'overview', period: 30, compare: true, ...view }} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  replace.mockReset();
});

describe('Analytics screen', () => {
  it('shows the headline, return per ৳1 and the funnel from the report', async () => {
    show();
    expect(await screen.findByText('from 277 orders in the last 30 days')).toBeTruthy();
    expect(screen.getByText('came back for every ৳1 you spent on messages')).toBeTruthy();
    expect(screen.getByText(/You spent ৳8,739 on messages \(WhatsApp, SMS\)/)).toBeTruthy();
    const funnel = screen.getByRole('heading', { name: 'From message to order' }).closest('div')!;
    expect(within(funnel).getByText('Read (not SMS)')).toBeTruthy();
    expect(within(funnel).getByText('277')).toBeTruthy();
  });

  it('hides the comparison when Compare with before is off', async () => {
    show({ compare: false });
    await screen.findByText('from 277 orders in the last 30 days');
    expect(screen.queryByText(/vs the 30 days before/)).toBeNull();
    expect(screen.queryByText('Up 23%')).toBeNull();
  });

  it('shows the change from the period before when Compare is on', async () => {
    show();
    expect(await screen.findByText(/vs the 30 days before/)).toBeTruthy();
    expect(screen.getAllByText('Up 23%').length).toBeGreaterThan(0);
  });

  it('keeps the toggle in the URL', async () => {
    show();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Compare with before' }));
    expect(replace).toHaveBeenCalledWith('/analytics?tab=overview&period=30&compare=off');
  });

  it('hides a channel from the chart when its chip is tapped', async () => {
    show();
    const chip = await screen.findByRole('button', { name: /SMS/ });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });
});
