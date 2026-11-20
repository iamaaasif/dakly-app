import { Inject, Injectable } from '@nestjs/common';

import { lifecycleStages } from '@dakly/contracts/contacts';

import { OrderReportingService } from '../orders/order-reporting.service';
import { Clock } from '../platform/clock';
import { StoresService } from '../stores/stores.service';
import { AnalyticsRepository } from './analytics.repository';
import {
  monthToDate,
  reportDay,
  retainedSince,
  shiftReportDay,
  type ReportPeriod,
} from './report-period';

type Point = { day: string; value: bigint };

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(AnalyticsRepository) private readonly repository: AnalyticsRepository,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(OrderReportingService) private readonly orderReports: OrderReportingService,
  ) {}

  async periods(storeId: string, days: 7 | 30 | 90 | 365) {
    const timeZone = await this.stores.timeZone(storeId);
    const now = this.clock.now();
    const through = reportDay(now, timeZone);
    const from = shiftReportDay(through, 1 - days);
    return {
      asOf: now.toISOString(),
      timeZone,
      current: { from, through },
      previous: {
        from: shiftReportDay(from, -days),
        through: shiftReportDay(from, -1),
      },
    };
  }

  // Calendar days of the shop, each against the period right before it, for the same readers as periods().
  async calendarPeriods(storeId: string, calendar: 'today' | 'yesterday' | 'this_month') {
    const timeZone = await this.stores.timeZone(storeId);
    const now = this.clock.now();
    const today = reportDay(now, timeZone);
    const day = calendar === 'today' ? today : shiftReportDay(today, -1);
    const { current, previous } =
      calendar === 'this_month'
        ? monthToDate(today)
        : {
            current: { from: day, through: day },
            previous: { from: shiftReportDay(day, -1), through: shiftReportDay(day, -1) },
          };
    return { asOf: now.toISOString(), timeZone, current, previous };
  }

  // Best sellers by items sold, cancelled orders left out; money is after discount, delivery left out.
  async topProducts(storeId: string, period: ReportPeriod, limit: number) {
    const timeZone = await this.stores.timeZone(storeId);
    return this.orderReports.topProducts(storeId, { ...period, timeZone }, limit);
  }

  orders(storeId: string, period: ReportPeriod) {
    return this.readOrderMetric(storeId, period, 'orders');
  }

  marketingRevenue(storeId: string, period: ReportPeriod) {
    return this.readOrderMetric(storeId, period, 'marketing_revenue');
  }

  marketingOrders(storeId: string, period: ReportPeriod) {
    return this.readOrderMetric(storeId, period, 'marketing_orders');
  }

  async campaignAttribution(storeId: string, ids: string[]) {
    const { current } = await this.periods(storeId, 30);
    return this.attributionBySource(
      storeId,
      { from: retainedSince(current.through), through: current.through },
      'campaign',
      ids,
    );
  }

  async attributionBySource(
    storeId: string,
    period: ReportPeriod,
    source: 'campaign' | 'automation',
    ids: string[],
  ) {
    if (!ids.length) return {};
    const dimensions = ids.map((id) => `${source}:${id}`);
    const rows = await this.repository.readAttributionMetrics(storeId, period, dimensions);
    const totals = new Map<string, bigint>();
    for (const { dimension, metric, value } of rows) {
      const key = `${dimension}/${metric}`;
      totals.set(key, (totals.get(key) ?? 0n) + value);
    }
    return Object.fromEntries(
      ids.map((id) => [
        id,
        {
          orders: (totals.get(`${source}:${id}/marketing_orders`) ?? 0n).toString(),
          revenuePoisha: (totals.get(`${source}:${id}/marketing_revenue`) ?? 0n).toString(),
        },
      ]),
    );
  }

  async marketingRevenueByChannel(storeId: string, period: ReportPeriod) {
    const rows = await this.repository.readChannelRevenue(storeId, period);
    return rows.map(({ day, dimension, value }) => ({
      day,
      channel: dimension.slice('channel:'.length),
      value,
    }));
  }

  async marketingOrdersByChannel(storeId: string, period: ReportPeriod) {
    const rows = await this.repository.readChannelOrders(storeId, period);
    return rows.map(({ dimension, value }) => ({
      channel: dimension.slice('channel:'.length),
      value,
    }));
  }

  channelPeople(storeId: string, period: ReportPeriod, timeZone: string) {
    return this.repository.channelPeople(storeId, { ...period, timeZone });
  }

  messagePeople(storeId: string, period: ReportPeriod, timeZone: string) {
    return this.repository.messagePeople(storeId, { ...period, timeZone });
  }

  async sales(storeId: string, period: ReportPeriod) {
    const rows = await this.repository.readDailyMetrics(storeId, period, ['sales']);
    const byDay = new Map<string, bigint>();
    const bySource = new Map<string, bigint>();
    for (const { day, dimension, value } of rows) {
      byDay.set(day, (byDay.get(day) ?? 0n) + value);
      bySource.set(dimension, (bySource.get(dimension) ?? 0n) + value);
    }
    const days = [...byDay].map(([day, value]) => ({ day, value }));
    return {
      total: sumPoints(days),
      points: fillDays(period, days),
      bySource: Object.fromEntries(bySource),
    };
  }

  deliveredSales(storeId: string, period: ReportPeriod) {
    return this.readOrderMetric(storeId, period, 'net_spend');
  }

  async averageOrderValue(storeId: string, period: ReportPeriod) {
    const rows = await this.repository.readDailyMetrics(storeId, period, [
      'net_spend',
      'delivered_orders',
    ]);
    const spend = rows.filter(({ metric }) => metric === 'net_spend');
    const delivered = rows.filter(({ metric }) => metric === 'delivered_orders');
    const spendByDay = new Map(spend.map(({ day, value }) => [day, value]));
    return {
      total: averagePoisha(sumPoints(spend), sumPoints(delivered)),
      points: fillDays(
        period,
        delivered.map(({ day, value }) => ({
          day,
          value: averagePoisha(spendByDay.get(day) ?? 0n, value),
        })),
      ),
    };
  }

  async newCustomers(storeId: string, period: ReportPeriod) {
    return this.readBuyers(storeId, period, 'new');
  }

  async customersWhoCameBack(storeId: string, period: ReportPeriod) {
    return this.readBuyers(storeId, period, 'returning');
  }

  async lifecycleCounts(storeId: string, period: ReportPeriod) {
    const rows = await this.repository.readLifecycle(storeId, period);
    const counts = new Map(rows.map(({ dimension, value }) => [dimension, Number(value)]));
    const stages = lifecycleStages.filter((stage) => stage !== 'none');
    return Object.fromEntries(stages.map((stage) => [stage, counts.get(stage) ?? 0])) as Record<
      (typeof stages)[number],
      number
    >;
  }

  private async readOrderMetric(storeId: string, period: ReportPeriod, metric: string) {
    const rows = await this.repository.readDailyMetrics(storeId, period, [metric]);
    return { total: sumPoints(rows), points: fillDays(period, rows) };
  }

  private async readBuyers(storeId: string, period: ReportPeriod, kind: 'new' | 'returning') {
    const rows = await this.repository.readBuyers(storeId, period, kind);
    const totals = rows.find(({ day }) => day === null);
    const points = rows.flatMap(({ day, value }) =>
      day === null ? [] : [{ day, value: BigInt(value) }],
    );
    return { total: BigInt(totals?.value ?? 0), points: fillDays(period, points) };
  }

  // The maintenance job calls this for every store and finished Dhaka day; a rerun gives the same rows.
  rollUpAiRunDay(storeId: string, day: string) {
    return this.repository.rollUpAiRunDay(storeId, day);
  }
}

function fillDays(period: ReportPeriod, rows: Point[]): Point[] {
  const values = new Map(rows.map(({ day, value }) => [day, value]));
  const points: Point[] = [];
  for (let day = period.from; day <= period.through; day = shiftReportDay(day, 1)) {
    points.push({ day, value: values.get(day) ?? 0n });
  }
  return points;
}

function sumPoints(points: Point[]) {
  return points.reduce((total, { value }) => total + value, 0n);
}

function averagePoisha(spend: bigint, orders: bigint) {
  return orders === 0n ? 0n : (spend + orders / 2n) / orders;
}
