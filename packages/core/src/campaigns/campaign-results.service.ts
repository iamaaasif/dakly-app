import { Inject, Injectable } from '@nestjs/common';

import type {
  CampaignCustomersQuery,
  CampaignCustomersResponse,
  CampaignResultsResponse,
} from '@dakly/contracts/campaigns';

import { AnalyticsService } from '../analytics/analytics.service';
import { StoresService } from '../stores/stores.service';
import { CampaignResultsRepository } from './campaign-results.repository';
import { campaignError } from './campaigns.errors';

const DAY_MS = 24 * 60 * 60 * 1000;

// Report numbers come from here and from the analytics service; the browser only formats them.
@Injectable()
export class CampaignResultsService {
  constructor(
    @Inject(CampaignResultsRepository) private readonly repository: CampaignResultsRepository,
    @Inject(AnalyticsService) private readonly reports: AnalyticsService,
    @Inject(StoresService) private readonly stores: StoresService,
  ) {}

  async results(storeId: string, campaignId: string): Promise<CampaignResultsResponse> {
    const summary = await this.requireSummary(storeId, campaignId);
    const [windowDays, attribution, failureReasons, smsFallbackCount, optedOutCount] =
      await Promise.all([
        this.stores.attributionWindowDays(storeId),
        this.reports.campaignAttribution(storeId, [campaignId]),
        this.repository.failureReasons(storeId, campaignId),
        summary.channel === 'sms' ? 0 : this.repository.smsFallbackCount(storeId, campaignId),
        this.repository.optedOutCount(storeId, campaignId),
      ]);
    return {
      costPoisha: String(summary.costPoisha),
      returnPerTakaPoisha: returnPerTaka(
        BigInt(attribution[campaignId]?.revenuePoisha ?? 0),
        BigInt(summary.costPoisha),
      ),
      attributionWindowDays: windowDays,
      resultsFinalAt: summary.finishedAt
        ? new Date(summary.finishedAt.getTime() + windowDays * DAY_MS).toISOString()
        : null,
      failureReasons,
      smsFallbackCount,
      optedOutCount,
    };
  }

  async customers(
    storeId: string,
    campaignId: string,
    { outcome, cursor, limit }: CampaignCustomersQuery,
  ): Promise<CampaignCustomersResponse> {
    await this.requireSummary(storeId, campaignId);
    if (outcome === 'ordered') {
      const rows = await this.reports.attributedOrders(
        storeId,
        { type: 'campaign', id: campaignId },
        { cursor, limit },
      );
      return page(
        rows.map(({ id, contactId, name, amountPoisha, placedAt }) => ({
          cursor: id,
          item: {
            contactId: contactId!,
            name,
            at: placedAt.toISOString(),
            orderValuePoisha: String(amountPoisha ?? 0),
          },
        })),
        limit,
      );
    }
    const rows = await this.repository.customers(storeId, campaignId, outcome, { cursor, limit });
    return page(
      rows.map(({ id, contactId, name, at }) => ({
        cursor: id,
        item: { contactId, name, at: at?.toISOString() ?? null, orderValuePoisha: null },
      })),
      limit,
    );
  }

  private async requireSummary(storeId: string, campaignId: string) {
    const summary = await this.repository.findSummary(storeId, campaignId);
    if (!summary) throw campaignError('CAMPAIGN_NOT_FOUND');
    return summary;
  }
}

// 100 poisha is ৳1, so revenue per poisha spent times 100 is the poisha earned per ৳1.
export function returnPerTaka(revenuePoisha: bigint, costPoisha: bigint): string | null {
  return costPoisha > 0n ? ((revenuePoisha * 100n) / costPoisha).toString() : null;
}

// Each query reads one row past the limit to know whether another page exists.
function page(
  rows: { cursor: string; item: CampaignCustomersResponse['items'][number] }[],
  limit: number,
): CampaignCustomersResponse {
  const shown = rows.slice(0, limit);
  return {
    items: shown.map(({ item }) => item),
    nextCursor: rows.length > limit ? shown.at(-1)!.cursor : null,
  };
}
