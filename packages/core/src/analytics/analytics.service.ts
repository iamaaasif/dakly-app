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
    const through = reportDay(this.clock.now(), timeZone);
    const from = shiftReportDay(through, 1 - days);
    return {
      current: { from, through },
      previous: {
        from: shiftReportDay(from, -days),
        through: shiftReportDay(from, -1),
      },
    };
  }

  async orders(storeId: string, period: ReportPeriod) {
    const rows = await this.repository.readDailyMetric(storeId, period, 'orders');
    return {
      total: rows.reduce((total, { value }) => total + value, 0n),
      points: fillDays(period, rows),
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
