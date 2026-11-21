import { Inject, Injectable } from '@nestjs/common';

import type { AnalyticsProfitResponse, AnalyticsQuery } from '@dakly/contracts/analytics';

import { AutomationsService } from '../automations/automations.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { readMessageTotals, sumTotals } from './analytics-message-totals';
import { returnPerTaka } from './analytics-ratios';
import { AnalyticsService } from './analytics.service';

@Injectable()
export class AnalyticsProfitService {
  constructor(
    @Inject(AnalyticsService) private readonly reports: AnalyticsService,
    @Inject(CampaignsService) private readonly campaigns: CampaignsService,
    @Inject(AutomationsService) private readonly automations: AutomationsService,
  ) {}

  async profit(storeId: string, { period }: AnalyticsQuery): Promise<AnalyticsProfitResponse> {
    const { asOf, timeZone, current, previous } = await this.reports.periods(storeId, period);
    const [now, before] = await Promise.all([
      this.side(storeId, { ...current, timeZone }),
      this.side(storeId, { ...previous, timeZone }),
    ]);
    const pair = (pick: (side: typeof now) => bigint) => ({
      currentPoisha: pick(now).toString(),
      previousPoisha: pick(before).toString(),
    });
    return {
      asOf,
      timeZone,
      current,
      previous,
      revenue: pair((side) => side.orders.revenuePoisha),
      productCost: pair((side) => side.orders.productCostPoisha),
      deliveryCost: pair((side) => side.orders.deliveryCostPoisha),
      messageCost: pair((side) => side.messageCost),
      profit: pair((side) => side.profit),
      countedOrders: { current: now.orders.counted, previous: before.orders.counted },
      excludedOrders: { current: now.orders.excluded, previous: before.orders.excluded },
      returnPerTaka: {
        current: returnPerTaka(now.profit, now.messageCost),
        previous: returnPerTaka(before.profit, before.messageCost),
      },
    };
  }

  private async side(storeId: string, range: { from: string; through: string; timeZone: string }) {
    const [orders, messages] = await Promise.all([
      this.reports.marketingProfitInputs(storeId, range),
      readMessageTotals(this.campaigns, this.automations, storeId, range),
    ]);
    const messageCost = sumTotals([...messages.values()]).cost;
    const profit =
      orders.revenuePoisha - orders.productCostPoisha - orders.deliveryCostPoisha - messageCost;
    return { orders, messageCost, profit };
  }
}
