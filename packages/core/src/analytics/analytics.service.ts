import { Inject, Injectable } from '@nestjs/common';

import { lifecycleStages } from '@dakly/contracts/contacts';

import { Clock } from '../platform/clock';
import { StoresService } from '../stores/stores.service';
import { AnalyticsRepository } from './analytics.repository';
import { reportDay, shiftReportDay, type ReportPeriod } from './report-period';

type Point = { day: string; value: bigint };

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(AnalyticsRepository) private readonly repository: AnalyticsRepository,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StoresService) private readonly stores: StoresService,
  ) {}

  async periods(storeId: string, days: 7 | 30 | 90) {
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

  orders(storeId: string, period: ReportPeriod) {
    return this.readOrderMetric(storeId, period, 'orders');
  }

  sales(storeId: string, period: ReportPeriod) {
    return this.readOrderMetric(storeId, period, 'sales');
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
