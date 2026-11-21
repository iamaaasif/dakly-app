import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { vi } from 'vitest';

import type {
  AnalyticsAiAgentResponse,
  AnalyticsAutomationRow,
  AnalyticsCampaignRow,
  AnalyticsChannelsResponse,
  AnalyticsOverviewResponse,
  AnalyticsSocialPostsResponse,
  AnalyticsTipResponse,
  AnalyticsView,
} from '@dakly/contracts/analytics';
import type { SessionContext } from '@dakly/contracts/sessions';
import type { AttributionSettingsResponse } from '@dakly/contracts/stores';

import { AnalyticsScreen } from './analytics-screen';
import { sessionContextKey } from '@/lib/session-context';

export const replace = vi.fn();

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

export const aiAgentResponse: AnalyticsAiAgentResponse = {
  asOf: overview.asOf,
  timeZone: 'Asia/Dhaka',
  current: overview.current,
  previous: overview.previous,
  chats: { current: 412, previous: 360 },
  resolved: { current: 301, previous: 250 },
  resolutionPercent: { current: 78.2, previous: 75.8 },
  answeredByPerson: { current: 40, previous: 38 },
  handedOver: { current: 44, previous: 52 },
  stillOpen: 27,
  handoverReasons: [
    { reason: 'discount', chats: 19 },
    { reason: 'refund', chats: 15 },
    { reason: 'asked_for_person', chats: 10 },
  ],
  orders: { current: 63, previous: 51 },
  sales: { currentPoisha: '8125000', previousPoisha: '6240000' },
  cost: { currentPoisha: '184250', previousPoisha: '161000' },
};

export type ShowOptions = {
  attribution?: AttributionSettingsResponse;
  canChange?: boolean;
  tip?: AnalyticsTipResponse;
  requests?: { url: string; method: string; body: string | null }[];
};

export function show(view: Partial<AnalyticsView> = {}, options: ShowOptions = {}) {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    options.requests?.push({
      url,
      method: init?.method ?? 'GET',
      body: (init?.body as string | undefined) ?? null,
    });
    const bodies = {
      '/analytics/campaigns': { current: overview.current, campaigns },
      '/analytics/automations': { current: overview.current, automations },
      '/analytics/channels': channelsResponse,
      '/analytics/social-posts': socialResponse,
      '/analytics/ai-agent': aiAgentResponse,
      '/store/attribution': options.attribution ?? {
        windowDays: 7,
        rebuilding: false,
        processedOrders: null,
      },
      '/analytics/tip': options.tip ?? { tip: null },
    };
    const path = new URL(url, 'http://localhost').pathname.replace(/^\/api/, '');
    return Response.json(bodies[path as keyof typeof bodies] ?? overview, {
      headers: { 'x-session-context': 'verified' },
    });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionContextKey, {
    user: { id: 'member', name: 'Member' },
    currentStore: {
      storeId: 'shop',
      name: 'Shop',
      canViewAnalytics: true,
      canChangeAttributionWindow: options.canChange ?? false,
    },
    contextTag: 'verified',
    hasMemberships: true,
  } as SessionContext);
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
