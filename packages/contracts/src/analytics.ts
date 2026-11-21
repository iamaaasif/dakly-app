import { z } from 'zod';

import { campaignChannels } from './campaigns';

export const analyticsTabs = [
  'overview',
  'campaigns',
  'automations',
  'channels',
  'social',
] as const;
export const campaignSorts = [
  'name',
  'date',
  'sent',
  'tapped',
  'orders',
  'earned',
  'return',
] as const;
export type AnalyticsTab = (typeof analyticsTabs)[number];
// The AI agent tab has no CSV download yet, so it is a screen tab only.
export const analyticsViewTabs = [...analyticsTabs, 'ai-agent'] as const;

// ANA-R8: no period over 12 months in release 1.
const periodDays = { '30': 30, '90': 90, '365': 365 } as const;
export const analyticsQuerySchema = z.strictObject({
  period: z
    .enum(['30', '90', '365'])
    .default('30')
    .transform((value) => periodDays[value]),
});

export const analyticsExportQuerySchema = z.strictObject({
  tab: z.enum(analyticsTabs),
  period: analyticsQuerySchema.shape.period,
});
export type AnalyticsExportQuery = z.infer<typeof analyticsExportQuerySchema>;
// What the page keeps in the URL: the tab, the period, the Compare toggle and the Campaigns table filters.
export const analyticsViewSchema = z.object({
  tab: z.enum(analyticsViewTabs).default('overview'),
  period: analyticsQuerySchema.shape.period,
  compare: z
    .enum(['on', 'off'])
    .default('on')
    .transform((value) => value === 'on'),
  sort: z.enum(campaignSorts).default('earned'),
  channel: z.enum(['all', ...campaignChannels]).default('all'),
  search: z.string().max(80).default(''),
});
export type AnalyticsView = z.infer<typeof analyticsViewSchema>;

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export type AnalyticsChannel = (typeof campaignChannels)[number];

type DayRange = { from: string; through: string };
type Count = { current: number; previous: number };
type Money = { currentPoisha: string; previousPoisha: string };

// Rates are percent with one decimal; null means there is nothing to divide by.
export type AnalyticsChannelRow = {
  channel: AnalyticsChannel;
  sent: number;
  deliveredPercent: number | null;
  costPoisha: string;
  revenuePoisha: string;
};

export type AnalyticsCampaignRow = {
  id: string;
  name: string;
  channel: AnalyticsChannel;
  startedAt: string;
  sent: number;
  delivered: number;
  read: number;
  costPoisha: string;
  tapPercent: number | null;
  orders: number;
  revenuePoisha: string;
  returnPerTaka: number | null;
};

export type AnalyticsAutomationRow = {
  id: string;
  name: string;
  channels: AnalyticsChannel[];
  isActive: boolean;
  entered: number;
  sent: number;
  costPoisha: string;
  orders: number;
  revenuePoisha: string;
  orderedPercent: number | null;
  returnPerTaka: number | null;
};

export type AnalyticsCampaignsResponse = { current: DayRange; campaigns: AnalyticsCampaignRow[] };
export type AnalyticsAutomationsResponse = {
  current: DayRange;
  automations: AnalyticsAutomationRow[];
};

export type AnalyticsChannelDetail = {
  channel: AnalyticsChannel;
  revenuePoisha: string;
  orders: number;
  // Share of all money from marketing; null when marketing earned nothing.
  sharePercent: number | null;
  sent: number;
  deliveredPercent: number | null;
  // Null for SMS, which has no read receipts.
  readPercent: number | null;
  tapPercent: number | null;
  costPoisha: string;
  // Cost of one message in poisha, rounded; null when nothing was sent.
  costPerMessagePoisha: string | null;
  returnPerTaka: number | null;
};

export type AnalyticsChannelsResponse = {
  current: DayRange;
  channels: AnalyticsChannelDetail[];
  social: { posts: number; reach: number };
};

export type AnalyticsSocialPostRow = {
  id: string;
  caption: string;
  networks: ('facebook' | 'instagram')[];
  publishedAt: string;
  reach: number | null;
  reactions: number | null;
  comments: number | null;
  // Dakly links in posts are not tracked yet, so link taps stay null until they are.
  linkTaps: number | null;
};

export type AnalyticsSocialPostsResponse = {
  current: DayRange;
  posts: AnalyticsSocialPostRow[];
  totals: { reach: number; reactions: number };
};

export type AnalyticsFunnelStep = { count: number; percentOfPrevious: number | null };

export type AnalyticsOverviewResponse = {
  asOf: string;
  timeZone: string;
  current: DayRange;
  previous: DayRange;
  marketing: { revenue: Money; orders: Count; dailyRevenuePoisha: string[] };
  messages: {
    sent: Count;
    deliveredPercent: number | null;
    tappedPeople: Count;
    tapPercent: number | null;
    cost: Money;
  };
  // Dakly pays nothing for Messenger, so only a paid channel can have a return per ৳1.
  returnPerTaka: number | null;
  weeklyRevenue: { weekStart: string; byChannel: Partial<Record<AnalyticsChannel, string>> }[];
  // Total money per week of the previous period, for the dashed line when Compare is on.
  previousWeeklyRevenuePoisha: string[];
  channels: AnalyticsChannelRow[];
  best: {
    campaign: { id: string; name: string; revenuePoisha: string; returnPerTaka: number } | null;
    channel: { channel: AnalyticsChannel; returnPerTaka: number } | null;
    // Shown under the best channel when another channel earned more money.
    mostMoneyChannel: { channel: AnalyticsChannel; revenuePoisha: string } | null;
    automation: {
      id: string;
      name: string;
      revenuePoisha: string;
      returnPerTaka: number | null;
    } | null;
  };
  funnel: {
    sent: AnalyticsFunnelStep;
    delivered: AnalyticsFunnelStep;
    read: AnalyticsFunnelStep;
    tapped: AnalyticsFunnelStep;
    ordered: AnalyticsFunnelStep;
  };
};

export const analyticsTipSteps = ['delivered', 'read', 'tapped', 'ordered'] as const;
export type AnalyticsTipStep = (typeof analyticsTipSteps)[number];

// `suggestion` is null when the model was unavailable; the drop is still shown.
export type AnalyticsTipResponse = {
  tip: {
    step: AnalyticsTipStep;
    currentPercent: number;
    usualPercent: number;
    suggestion: string | null;
  } | null;
};

// What the AI agent did for the shop. Counts are chats the AI replied in during the period; see the
// glossary for how a chat is put in one of the groups. Cost is in poisha at the rate each run was saved with.
export type AnalyticsAiAgentResponse = {
  asOf: string;
  timeZone: string;
  current: DayRange;
  previous: DayRange;
  chats: Count;
  resolved: Count;
  // Resolved ÷ chats not still inside 24 hours; null when there are none to divide by.
  resolutionPercent: { current: number | null; previous: number | null };
  answeredByPerson: Count;
  handedOver: Count;
  stillOpen: number;
  handoverReasons: { reason: string; chats: number }[];
  orders: Count;
  sales: Money;
  cost: Money;
};
