import { Inject, Injectable } from '@nestjs/common';

import type { DashboardQuery, DashboardResponse } from '@dakly/contracts/dashboard';
import type { StoreAccess } from '@dakly/contracts/team';

import { AnalyticsService } from '../analytics/analytics.service';
import { TeamService } from '../team/team.service';

type CardReport = 'orders' | 'sales' | 'newCustomers' | 'customersWhoCameBack';
type Periods = Awaited<ReturnType<AnalyticsService['periods']>>;

@Injectable()
export class DashboardService {
  constructor(
    @Inject(AnalyticsService) private readonly reports: AnalyticsService,
    @Inject(TeamService) private readonly team: TeamService,
  ) {}

  async cards(
    storeId: string,
    { period }: DashboardQuery,
    access: StoreAccess,
  ): Promise<DashboardResponse> {
    const periods = await this.reports.periods(storeId, period);
    const { asOf, timeZone } = periods;
    const canViewOrders = this.team.canAccess(access, 'orders', 'view');
    const canViewCustomers = this.team.canAccess(access, 'customers', 'view');
    const [orders, sales, newCustomers, customersWhoCameBack, lifecycle] = await Promise.all([
      canViewOrders ? this.readCard(storeId, periods, 'orders') : undefined,
      canViewOrders ? this.readCard(storeId, periods, 'sales') : undefined,
      canViewCustomers ? this.readCard(storeId, periods, 'newCustomers') : undefined,
      canViewCustomers ? this.readCard(storeId, periods, 'customersWhoCameBack') : undefined,
      canViewCustomers ? this.reports.lifecycleCounts(storeId, periods.current) : undefined,
    ]);
    return {
      asOf,
      timeZone,
      cards: {
        orders,
        sales: sales && {
          totalPoisha: sales.total,
          previousPoisha: sales.previous,
          pointsPoisha: sales.points,
        },
        newCustomers,
        customersWhoCameBack,
      },
      lifecycle,
    };
  }

  private async readCard(storeId: string, periods: Periods, report: CardReport) {
    const [current, previous] = await Promise.all([
      this.reports[report](storeId, periods.current),
      this.reports[report](storeId, periods.previous),
    ]);
    return {
      total: current.total.toString(),
      previous: previous.total.toString(),
      points: current.points.map(({ value }) => value.toString()),
    };
  }
}
