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

type Totals = { sent: number; delivered: number; read: number; cost: bigint };
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
      this.messageTotals(storeId, current, timeZone),
      this.messageTotals(storeId, previous, timeZone),
      this.reports.messagePeople(storeId, current, timeZone),
      this.reports.messagePeople(storeId, previous, timeZone),
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
        tappedPeople: { current: people.tapped, previous: previousPeople.tapped },
        tapPercent: percent(people.tapped, people.delivered),
        cost: { currentPoisha: all.cost.toString(), previousPoisha: previousAll.cost.toString() },
      },
      returnPerTaka: returnPerTaka(revenue.total, all.cost),
      weeklyRevenue: weeklyRevenue(current, byChannel),
      previousWeeklyRevenuePoisha: weeklyTotals(previousRevenue.points),
      channels: channelRows(now, revenueByChannel),
      funnel: funnel(all, readable, people, Number(orders.total)),
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

function emptyTotals(): Totals {
  return { sent: 0, delivered: 0, read: 0, cost: 0n };
}

function sumTotals(rows: Totals[]): Totals {
  return rows.reduce(
    (sum, row) => ({
      sent: sum.sent + row.sent,
      delivered: sum.delivered + row.delivered,
      read: sum.read + row.read,
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

function funnel(
  all: Totals,
  readable: Totals,
  people: { delivered: number; tapped: number },
  ordered: number,
) {
  // An order can follow a read with no tap, so Ordered can pass the step before it; that has no sensible percent.
  const step = (count: number, before: number): AnalyticsFunnelStep => {
    const share = percent(count, before);
    return { count, percentOfPrevious: share !== null && share > 100 ? null : share };
  };
  return {
    sent: { count: all.sent, percentOfPrevious: null },
    delivered: step(all.delivered, all.sent),
    // The read step divides by delivered on the channels that report reads, not by all delivered.
    read: step(readable.read, readable.delivered),
    // Tapped counts people, so it is measured against people delivered to, as the tap rate is.
    tapped: step(people.tapped, people.delivered),
    ordered: step(ordered, people.tapped),
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
