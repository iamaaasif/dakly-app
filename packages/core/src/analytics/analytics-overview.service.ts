import { Inject, Injectable } from '@nestjs/common';

import type {
  AnalyticsChannel,
  AnalyticsOverviewResponse,
  AnalyticsQuery,
} from '@dakly/contracts/analytics';
import { campaignChannels } from '@dakly/contracts/campaigns';

import { AutomationsService } from '../automations/automations.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { DAY_MS } from '../platform/time';
import { funnel } from './analytics-funnel';
import { emptyTotals, readMessageTotals, sumTotals, type Totals } from './analytics-message-totals';
import { percent, returnPerTaka } from './analytics-ratios';
import { AnalyticsTabsService } from './analytics-tabs.service';
import { AnalyticsService } from './analytics.service';
import { shiftReportDay } from './report-period';

type Period = { from: string; through: string };

// SMS has no read receipts, so reads are measured against the other channels only (glossary).
const READ_CHANNELS: readonly AnalyticsChannel[] = ['whatsapp', 'messenger'];

@Injectable()
export class AnalyticsOverviewService {
  constructor(
    @Inject(AnalyticsService) private readonly reports: AnalyticsService,
    @Inject(CampaignsService) private readonly campaigns: CampaignsService,
    @Inject(AutomationsService) private readonly automations: AutomationsService,
    @Inject(AnalyticsTabsService) private readonly tabs: AnalyticsTabsService,
  ) {}

  async overview(storeId: string, { period }: AnalyticsQuery): Promise<AnalyticsOverviewResponse> {
    const { asOf, timeZone, current, previous } = await this.reports.periods(storeId, period);
    const [
      revenue,
      previousRevenue,
      orders,
      previousOrders,
      byChannel,
      now,
      before,
      people,
      previousPeople,
    ] = await Promise.all([
      this.reports.marketingRevenue(storeId, current),
      this.reports.marketingRevenue(storeId, previous),
      this.reports.marketingOrders(storeId, current),
      this.reports.marketingOrders(storeId, previous),
      this.reports.marketingRevenueByChannel(storeId, current),
      readMessageTotals(this.campaigns, this.automations, storeId, { ...current, timeZone }),
      readMessageTotals(this.campaigns, this.automations, storeId, { ...previous, timeZone }),
      this.reports.messagePeople(storeId, current, timeZone),
      this.reports.messagePeople(storeId, previous, timeZone),
    ]);

    const all = sumTotals([...now.values()]);
    const previousAll = sumTotals([...before.values()]);
    const readable = sumTotals(READ_CHANNELS.map((channel) => now.get(channel) ?? emptyTotals()));
    const revenueByChannel = new Map<string, bigint>();
    for (const { channel, value } of byChannel)
      revenueByChannel.set(channel, (revenueByChannel.get(channel) ?? 0n) + value);

    const channels = channelRows(now, revenueByChannel);
    const best = await this.tabs.best(storeId, { ...current, timeZone }, channels);
    return {
      asOf,
      timeZone,
      current,
      previous,
      marketing: {
        revenue: {
          currentPoisha: revenue.total.toString(),
          previousPoisha: previousRevenue.total.toString(),
        },
        orders: { current: Number(orders.total), previous: Number(previousOrders.total) },
        dailyRevenuePoisha: revenue.points.map(({ value }) => value.toString()),
      },
      messages: {
        sent: { current: all.sent, previous: previousAll.sent },
        deliveredPercent: percent(all.delivered, all.sent),
        tappedPeople: { current: people.tapped, previous: previousPeople.tapped },
        tapPercent: percent(people.tapped, people.delivered),
        cost: { currentPoisha: all.cost.toString(), previousPoisha: previousAll.cost.toString() },
      },
      returnPerTaka: returnPerTaka(revenue.total, all.cost),
      weeklyRevenue: weeklyRevenue(current, byChannel),
      previousWeeklyRevenuePoisha: weeklyTotals(previousRevenue.points),
      channels,
      best,
      funnel: funnel(all, readable, people, Number(orders.total)),
    };
  }
}

function channelRows(totals: Map<string, Totals>, revenue: Map<string, bigint>) {
  return campaignChannels.map((channel) => {
    const row = totals.get(channel) ?? emptyTotals();
    return {
      channel,
      sent: row.sent,
      deliveredPercent: percent(row.delivered, row.sent),
      costPoisha: row.cost.toString(),
      revenuePoisha: (revenue.get(channel) ?? 0n).toString(),
    };
  });
}

function weeklyRevenue(
  period: Period,
  rows: { day: string; channel: string; value: bigint }[],
): AnalyticsOverviewResponse['weeklyRevenue'] {
  const weeks = new Map<string, Partial<Record<AnalyticsChannel, bigint>>>();
  for (let start = period.from; start <= period.through; start = shiftReportDay(start, 7))
    weeks.set(start, {});
  for (const { day, channel, value } of rows) {
    if (!isChannel(channel)) continue;
    const offset = Math.floor((Date.parse(day) - Date.parse(period.from)) / (7 * DAY_MS));
    const week = weeks.get(shiftReportDay(period.from, offset * 7));
    if (week) week[channel] = (week[channel] ?? 0n) + value;
  }
  return [...weeks].map(([weekStart, byChannel]) => ({
    weekStart,
    byChannel: Object.fromEntries(
      Object.entries(byChannel).map(([channel, value]) => [channel, value.toString()]),
    ),
  }));
}

function weeklyTotals(points: { value: bigint }[]) {
  const weeks: bigint[] = [];
  points.forEach(({ value }, index) => {
    const week = Math.floor(index / 7);
    weeks[week] = (weeks[week] ?? 0n) + value;
  });
  return weeks.map((total) => total.toString());
}

function isChannel(value: string): value is AnalyticsChannel {
  return (campaignChannels as readonly string[]).includes(value);
}
