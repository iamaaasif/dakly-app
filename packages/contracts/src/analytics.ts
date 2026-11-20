import { z } from 'zod';

import type { campaignChannels } from './campaigns';

export const analyticsTabs = [
  'overview',
  'campaigns',
  'automations',
  'channels',
  'social-posts',
] as const;
export type AnalyticsTab = (typeof analyticsTabs)[number];

// ANA-R8: no period over 12 months in release 1.
const periodDays = { '30': 30, '90': 90, '365': 365 } as const;
export const analyticsQuerySchema = z.strictObject({
  period: z
    .enum(['30', '90', '365'])
    .default('30')
    .transform((value) => periodDays[value]),
});

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
  channels: AnalyticsChannelRow[];
  funnel: {
    sent: AnalyticsFunnelStep;
    delivered: AnalyticsFunnelStep;
    read: AnalyticsFunnelStep;
    tapped: AnalyticsFunnelStep;
    ordered: AnalyticsFunnelStep;
  };
};
