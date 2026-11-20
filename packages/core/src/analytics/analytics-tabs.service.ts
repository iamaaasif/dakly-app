import { Inject, Injectable } from '@nestjs/common';

import type {
  AnalyticsAutomationRow,
  AnalyticsAutomationsResponse,
  AnalyticsCampaignRow,
  AnalyticsCampaignsResponse,
  AnalyticsChannel,
  AnalyticsOverviewResponse,
  AnalyticsQuery,
} from '@dakly/contracts/analytics';
import { campaignChannels } from '@dakly/contracts/campaigns';

import { AutomationsService } from '../automations/automations.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { percent, returnPerTaka } from './analytics-ratios';
import { AnalyticsService } from './analytics.service';

type Range = { from: string; through: string; timeZone: string };
type Best = AnalyticsOverviewResponse['best'];

const BEST_CAMPAIGN_MIN_DELIVERED = 100;
const BEST_CAMPAIGN_MIN_ORDERS = 3;
const BEST_CHANNEL_MIN_COST_POISHA = 50_000n;

@Injectable()
export class AnalyticsTabsService {
  constructor(
    @Inject(AnalyticsService) private readonly reports: AnalyticsService,
    @Inject(CampaignsService) private readonly campaigns: CampaignsService,
    @Inject(AutomationsService) private readonly automations: AutomationsService,
  ) {}

  async campaignsTab(
    storeId: string,
    { period }: AnalyticsQuery,
  ): Promise<AnalyticsCampaignsResponse> {
    const { timeZone, current } = await this.reports.periods(storeId, period);
    return { current, campaigns: await this.campaignRows(storeId, { ...current, timeZone }) };
  }

  async automationsTab(
    storeId: string,
    { period }: AnalyticsQuery,
  ): Promise<AnalyticsAutomationsResponse> {
    const { timeZone, current } = await this.reports.periods(storeId, period);
    return { current, automations: await this.automationRows(storeId, { ...current, timeZone }) };
  }

  async campaignRows(storeId: string, range: Range): Promise<AnalyticsCampaignRow[]> {
    const started = await this.campaigns.startedBetween(storeId, range);
    const results = await this.reports.attributionBySource(
      storeId,
      range,
      'campaign',
      started.map(({ id }) => id),
    );
    return started.map((campaign) => {
      const { orders, revenuePoisha } = results[campaign.id]!;
      return {
        id: campaign.id,
        name: campaign.name,
        channel: campaign.channel,
        startedAt: campaign.startedAt!.toISOString(),
        sent: campaign.sent,
        delivered: campaign.delivered,
        tapPercent: percent(campaign.tappedPeople, campaign.delivered),
        orders: Number(orders),
        revenuePoisha,
        returnPerTaka: returnPerTaka(BigInt(revenuePoisha), BigInt(campaign.costPoisha)),
      };
    });
  }

  async automationRows(storeId: string, range: Range): Promise<AnalyticsAutomationRow[]> {
    const live = await this.automations.liveInRange(storeId, range);
    const results = await this.reports.attributionBySource(
      storeId,
      range,
      'automation',
      live.map(({ id }) => id),
    );
    return live.map((automation) => {
      const { orders, revenuePoisha } = results[automation.id]!;
      return {
        id: automation.id,
        name: automation.name,
        channels: automation.channels.split(',').filter(isChannel),
        isActive: automation.status === 'active',
        entered: automation.entered,
        sent: automation.sent,
        orders: Number(orders),
        revenuePoisha,
        orderedPercent: percent(Number(orders), automation.entered),
        returnPerTaka: returnPerTaka(BigInt(revenuePoisha), BigInt(automation.costPoisha)),
      };
    });
  }

  async best(
    storeId: string,
    range: Range,
    channels: AnalyticsOverviewResponse['channels'],
  ): Promise<Best> {
    const [campaigns, automations] = await Promise.all([
      this.campaignRows(storeId, range),
      this.automationRows(storeId, range),
    ]);
    const qualified = campaigns.filter(
      (row) =>
        row.delivered >= BEST_CAMPAIGN_MIN_DELIVERED &&
        row.orders >= BEST_CAMPAIGN_MIN_ORDERS &&
        row.returnPerTaka !== null,
    );
    const campaign = qualified.sort((a, b) => b.returnPerTaka! - a.returnPerTaka!)[0];
    const automation = automations
      .filter((row) => BigInt(row.revenuePoisha) > 0n)
      .sort(
        (a, b) =>
          compareMoney(b.revenuePoisha, a.revenuePoisha) ||
          (b.returnPerTaka ?? 0) - (a.returnPerTaka ?? 0),
      )[0];
    const paid = channels.filter(
      ({ costPoisha }) => BigInt(costPoisha) >= BEST_CHANNEL_MIN_COST_POISHA,
    );
    const channel = paid
      .map((row) => ({
        row,
        ratio: returnPerTaka(BigInt(row.revenuePoisha), BigInt(row.costPoisha))!,
      }))
      .sort((a, b) => b.ratio - a.ratio)[0];
    const richest = [...channels].sort((a, b) => compareMoney(b.revenuePoisha, a.revenuePoisha))[0];
    return {
      campaign: campaign
        ? {
            id: campaign.id,
            name: campaign.name,
            revenuePoisha: campaign.revenuePoisha,
            returnPerTaka: campaign.returnPerTaka!,
          }
        : null,
      channel: channel ? { channel: channel.row.channel, returnPerTaka: channel.ratio } : null,
      mostMoneyChannel:
        richest && BigInt(richest.revenuePoisha) > 0n && richest.channel !== channel?.row.channel
          ? { channel: richest.channel, revenuePoisha: richest.revenuePoisha }
          : null,
      automation: automation
        ? {
            id: automation.id,
            name: automation.name,
            revenuePoisha: automation.revenuePoisha,
            returnPerTaka: automation.returnPerTaka,
          }
        : null,
    };
  }
}

function compareMoney(a: string, b: string) {
  const difference = BigInt(a) - BigInt(b);
  if (difference === 0n) return 0;
  return difference > 0n ? 1 : -1;
}

function isChannel(value: string): value is AnalyticsChannel {
  return (campaignChannels as readonly string[]).includes(value);
}
