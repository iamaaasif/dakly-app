// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AnalyticsAutomationRow,
  AnalyticsCampaignRow,
  AnalyticsChannelsResponse,
  AnalyticsOverviewResponse,
  AnalyticsSocialPostsResponse,
  AnalyticsView,
} from '@dakly/contracts/analytics';
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
  best: {
    campaign: { id: 'c1', name: 'Puja winback', revenuePoisha: '11240000', returnPerTaka: 204 },
    channel: { channel: 'sms', returnPerTaka: 94 },
    mostMoneyChannel: { channel: 'whatsapp', revenuePoisha: '34575000' },
    automation: null,
  },
  funnel: {
    sent: { count: 9182, percentOfPrevious: null },
    delivered: { count: 9026, percentOfPrevious: 98.3 },
    read: { count: 7172, percentOfPrevious: 79.5 },
    tapped: { count: 1250, percentOfPrevious: 13.8 },
    ordered: { count: 277, percentOfPrevious: 22.2 },
  },
};

const campaigns: AnalyticsCampaignRow[] = [
  {
    id: 'c1',
    name: 'Puja winback',
    channel: 'sms',
    startedAt: '2026-11-10T06:00:00.000Z',
    sent: 850,
    delivered: 800,
    read: 0,
    costPoisha: '55000',
    tapPercent: 15.1,
    orders: 38,
    revenuePoisha: '11240000',
    returnPerTaka: 204,
  },
  {
    id: 'c2',
    name: 'New Kurti collection',
    channel: 'whatsapp',
    startedAt: '2026-11-01T06:00:00.000Z',
    sent: 1240,
    delivered: 1200,
    read: 900,
    costPoisha: '117000',
    tapPercent: 21.6,
    orders: 61,
    revenuePoisha: '18690000',
    returnPerTaka: 159,
  },
];

const automations: AnalyticsAutomationRow[] = [
  {
    id: 'a1',
    name: 'Welcome new subscribers',
    channels: ['whatsapp'],
    isActive: true,
    entered: 12642,
    sent: 12000,
    costPoisha: '560000',
    orders: 861,
    revenuePoisha: '67410000',
    orderedPercent: 6.8,
    returnPerTaka: 120,
  },
];

const channelsResponse: AnalyticsChannelsResponse = {
  current: overview.current,
  channels: [
    {
      channel: 'whatsapp',
      revenuePoisha: '166282500',
      orders: 1497,
      sharePercent: 66,
      sent: 45130,
      deliveredPercent: 98,
      readPercent: 78,
      tapPercent: 21.5,
      costPoisha: '6650000',
      costPerMessagePoisha: '95',
      returnPerTaka: 25,
    },
    {
      channel: 'sms',
      revenuePoisha: '35575000',
      orders: 188,
      sharePercent: 14,
      sent: 8101,
      deliveredPercent: 97,
      readPercent: null,
      tapPercent: 9.1,
      costPoisha: '340000',
      costPerMessagePoisha: '42',
      returnPerTaka: 104,
    },
    {
      channel: 'messenger',
      revenuePoisha: '0',
      orders: 0,
      sharePercent: null,
      sent: 0,
      deliveredPercent: null,
      readPercent: null,
      tapPercent: null,
      costPoisha: '0',
      costPerMessagePoisha: null,
      returnPerTaka: null,
    },
  ],
  social: { posts: 2, reach: 10330 },
};

const socialResponse: AnalyticsSocialPostsResponse = {
  current: overview.current,
  posts: [
    {
      id: 'p1',
      caption: 'Thank you for 18,000 followers.',
      networks: ['facebook'],
      publishedAt: '2026-10-30T06:00:00.000Z',
      reach: 6120,
      reactions: 540,
      comments: 12,
      linkTaps: null,
    },
    {
      id: 'p2',
      caption: 'Our winter kurti collection is here.',
      networks: ['facebook', 'instagram'],
      publishedAt: '2026-11-02T06:00:00.000Z',
      reach: 4210,
      reactions: null,
      comments: null,
      linkTaps: null,
    },
  ],
  totals: { reach: 10330, reactions: 540 },
};

function show(view: Partial<AnalyticsView> = {}) {
  vi.stubGlobal('fetch', async (url: string) => {
    const bodies = {
      '/analytics/campaigns': { current: overview.current, campaigns },
      '/analytics/automations': { current: overview.current, automations },
      '/analytics/channels': channelsResponse,
      '/analytics/social-posts': socialResponse,
    };
    const path = new URL(url, 'http://localhost').pathname.replace(/^.*(?=\/analytics)/, '');
    return Response.json(bodies[path as keyof typeof bodies] ?? overview, {
      headers: { 'x-session-context': 'verified' },
    });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    user: { id: 'member', name: 'Member' },
    currentStore: { storeId: 'shop', name: 'Shop', canViewAnalytics: true },
    contextTag: 'verified',
    hasMemberships: true,
  } as unknown as SessionContext);
  render(
    <QueryClientProvider client={client}>
      <AnalyticsScreen
        view={{
          tab: 'overview',
          period: 30,
          compare: true,
          sort: 'earned',
          channel: 'all',
          search: '',
          ...view,
        }}
      />
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

  it('shows the Best cards, with a second line when another channel earned more money', async () => {
    show();
    const cards = await screen.findByRole('region', { name: 'What worked best' });
    expect(within(cards).getByText('Puja winback')).toBeTruthy();
    expect(within(cards).getByText('৳204 back for every ৳1')).toBeTruthy();
    expect(within(cards).getByText('৳94 per ৳1')).toBeTruthy();
    expect(within(cards).getByText(/WhatsApp earned the most money: ৳3,45,750/)).toBeTruthy();
    expect(within(cards).getByText(/Turn on an automation/)).toBeTruthy();
  });

  it('lists campaigns by money earned and opens a campaign from its row', async () => {
    show({ tab: 'campaigns' });
    const table = await screen.findByRole('table', { name: 'Campaigns' });
    const names = within(table)
      .getAllByRole('link')
      .map((link) => link.textContent)
      .filter((text) => text?.includes('Puja') || text?.includes('Kurti'));
    expect(names).toEqual(['New Kurti collection', 'Puja winback']);
    expect(within(table).getByRole('link', { name: 'Puja winback' }).getAttribute('href')).toBe(
      '/campaigns/c1',
    );
    expect(within(table).getByText('৳204')).toBeTruthy();
    expect(screen.getByText('2 campaigns · ৳2,99,300 earned')).toBeTruthy();
  });

  it('filters campaigns by the search and channel in the URL', async () => {
    show({ tab: 'campaigns', search: 'puja', channel: 'sms' });
    const table = await screen.findByRole('table', { name: 'Campaigns' });
    expect(within(table).queryByText('New Kurti collection')).toBeNull();
    expect(within(table).getByText('Puja winback')).toBeTruthy();
    expect(screen.getByText('1 campaign · ৳1,12,400 earned')).toBeTruthy();
  });

  it('keeps the sort in the URL', async () => {
    show({ tab: 'campaigns' });
    const table = await screen.findByRole('table', { name: 'Campaigns' });
    expect(within(table).getByRole('link', { name: 'Sort by Orders' }).getAttribute('href')).toBe(
      '/analytics?tab=campaigns&period=30&sort=orders',
    );
  });

  it('shows what each automation earned and how many customers ordered', async () => {
    show({ tab: 'automations' });
    const list = await screen.findByRole('list', { name: 'Automations' });
    expect(within(list).getByText('Welcome new subscribers')).toBeTruthy();
    expect(
      within(list).getByText('WhatsApp · 12,642 customers went through it · 6.8% ordered'),
    ).toBeTruthy();
    expect(within(list).getByText('861 orders')).toBeTruthy();
    expect(screen.getByText('Earned on autopilot')).toBeTruthy();
  });

  it('compares what each channel costs and earns, and says SMS reads cannot be tracked', async () => {
    show({ tab: 'channels' });
    const whatsapp = (await screen.findByRole('heading', { name: 'WhatsApp' })).closest('div')!
      .parentElement!.parentElement!;
    expect(within(whatsapp).getByText('66% of your marketing money')).toBeTruthy();
    expect(within(whatsapp).getByText('৳16,62,825')).toBeTruthy();
    expect(within(whatsapp).getByText('1,497 orders')).toBeTruthy();
    expect(within(whatsapp).getByText('৳25')).toBeTruthy();
    expect(within(whatsapp).getByText('45,130 messages')).toBeTruthy();
    expect(within(whatsapp).getByText('78%')).toBeTruthy();
    expect(within(whatsapp).getByText('৳0.95')).toBeTruthy();
    expect(screen.getByText('Can’t be tracked')).toBeTruthy();
    expect(screen.getByText('No money from marketing yet')).toBeTruthy();
  });

  it('shows social posts with no money or taps, because Dakly links in posts are not tracked', async () => {
    show({ tab: 'channels' });
    expect(await screen.findByText('10,330 people reached')).toBeTruthy();
    expect(screen.getByText('Dakly links in posts are not tracked yet')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
  });

  it('ranks posts by reach and shows where and when each was published', async () => {
    show({ tab: 'social' });
    const list = await screen.findByRole('list', { name: 'Social posts' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]!.textContent).toContain('Thank you for 18,000 followers.');
    expect(within(rows[0]!).getByText('Facebook · Oct 30')).toBeTruthy();
    expect(within(rows[1]!).getByText('Facebook + Instagram · Nov 2')).toBeTruthy();
    expect(within(rows[0]!).getByText('6,120')).toBeTruthy();
    expect(screen.getByText('10,330 people reached · 540 reactions')).toBeTruthy();
    expect(screen.getByText(/update these numbers for up to 2 days/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See all posts' }).getAttribute('href')).toBe(
      '/social',
    );
  });
});
