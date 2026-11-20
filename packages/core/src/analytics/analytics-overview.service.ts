import { Inject, Injectable } from '@nestjs/common';

import type {
  AnalyticsChannel,
  AnalyticsFunnelStep,
  AnalyticsOverviewResponse,
  AnalyticsQuery,
} from '@dakly/contracts/analytics';
import { campaignChannels } from '@dakly/contracts/campaigns';

import { AutomationsService } from '../automations/automations.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { DAY_MS } from '../platform/time';
import { AnalyticsService } from './analytics.service';
import { shiftReportDay } from './report-period';

type Totals = { sent: number; delivered: number; read: number; tapped: number; cost: bigint };
type Period = { from: string; through: string };

// SMS has no read receipts, so reads are measured against the other channels only (glossary).
const READ_CHANNELS: readonly AnalyticsChannel[] = ['whatsapp', 'messenger'];

@Injectable()
export class AnalyticsOverviewService {
  constructor(
    @Inject(AnalyticsService) private readonly reports: AnalyticsService,
    @Inject(CampaignsService) private readonly campaigns: CampaignsService,
    @Inject(AutomationsService) private readonly automations: AutomationsService,
  ) {}

  async overview(storeId: string, { period }: AnalyticsQuery): Promise<AnalyticsOverviewResponse> {
    const { asOf, timeZone, current, previous } = await this.reports.periods(storeId, period);
    const [revenue, previousRevenue, orders, previousOrders, byChannel, now, before] =
      await Promise.all([
        this.reports.marketingRevenue(storeId, current),
        this.reports.marketingRevenue(storeId, previous),
        this.reports.marketingOrders(storeId, current),
        this.reports.marketingOrders(storeId, previous),
        this.reports.marketingRevenueByChannel(storeId, current),
        this.messageTotals(storeId, current, timeZone),
        this.messageTotals(storeId, previous, timeZone),
      ]);

    const all = sumTotals([...now.values()]);
    const previousAll = sumTotals([...before.values()]);
    const readable = sumTotals(READ_CHANNELS.map((channel) => now.get(channel) ?? emptyTotals()));
    const revenueByChannel = new Map<string, bigint>();
    for (const { channel, value } of byChannel)
      revenueByChannel.set(channel, (revenueByChannel.get(channel) ?? 0n) + value);

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
        tappedPeople: { current: all.tapped, previous: previousAll.tapped },
        tapPercent: percent(all.tapped, all.delivered),
        cost: { currentPoisha: all.cost.toString(), previousPoisha: previousAll.cost.toString() },
      },
      returnPerTaka: returnPerTaka(revenue.total, all.cost),
      weeklyRevenue: weeklyRevenue(current, byChannel),
      channels: campaignChannels.map((channel) => {
        const totals = now.get(channel) ?? emptyTotals();
        return {
          channel,
          sent: totals.sent,
          deliveredPercent: percent(totals.delivered, totals.sent),
          costPoisha: totals.cost.toString(),
          revenuePoisha: (revenueByChannel.get(channel) ?? 0n).toString(),
        };
      }),
      funnel: funnel(all, readable, Number(orders.total)),
    };
  }

  private async messageTotals(storeId: string, period: Period, timeZone: string) {
    const range = { ...period, timeZone };
    const [fromCampaigns, fromAutomations] = await Promise.all([
      this.campaigns.messageTotals(storeId, range),
      this.automations.messageTotals(storeId, range),
    ]);
    const totals = new Map<string, Totals>();
    for (const row of [...fromCampaigns, ...fromAutomations]) {
      const known = totals.get(row.channel) ?? emptyTotals();
      totals.set(row.channel, sumTotals([known, { ...row, cost: BigInt(row.costPoisha) }]));
    }
    return totals;
  }
}

function emptyTotals(): Totals {
  return { sent: 0, delivered: 0, read: 0, tapped: 0, cost: 0n };
}

function sumTotals(rows: Totals[]): Totals {
  return rows.reduce(
    (sum, row) => ({
      sent: sum.sent + row.sent,
      delivered: sum.delivered + row.delivered,
      read: sum.read + row.read,
      tapped: sum.tapped + row.tapped,
      cost: sum.cost + row.cost,
    }),
    emptyTotals(),
  );
}

function percent(part: number, whole: number) {
  return whole === 0 ? null : Math.round((part / whole) * 1000) / 10;
}

// Glossary: money from marketing ÷ message cost, rounded to whole ৳, hidden when cost is ৳0.
function returnPerTaka(revenue: bigint, cost: bigint) {
  return cost === 0n ? null : Number((revenue + cost / 2n) / cost);
}

function funnel(all: Totals, readable: Totals, ordered: number) {
  const step = (count: number, before: number): AnalyticsFunnelStep => ({
    count,
    percentOfPrevious: percent(count, before),
  });
  return {
    sent: { count: all.sent, percentOfPrevious: null },
    delivered: step(all.delivered, all.sent),
    // The read step divides by delivered on the channels that report reads, not by all delivered.
    read: step(readable.read, readable.delivered),
    tapped: step(all.tapped, all.delivered),
    ordered: step(ordered, all.tapped),
  };
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

function isChannel(value: string): value is AnalyticsChannel {
  return (campaignChannels as readonly string[]).includes(value);
}
