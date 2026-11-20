import { Inject, Injectable } from '@nestjs/common';

import type {
  AnalyticsChannelDetail,
  AnalyticsChannelsResponse,
  AnalyticsQuery,
  AnalyticsSocialPostsResponse,
} from '@dakly/contracts/analytics';
import { campaignChannels } from '@dakly/contracts/campaigns';

import { AutomationsService } from '../automations/automations.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { SocialAnalyticsService } from '../social/social-analytics.service';
import { emptyTotals, readMessageTotals } from './analytics-message-totals';
import { percent, returnPerTaka } from './analytics-ratios';
import { AnalyticsService } from './analytics.service';

// SMS has no read receipts, so it has no read rate (glossary).
const READ_CHANNELS: readonly string[] = ['whatsapp', 'messenger'];

const networks = { facebook_page: 'facebook', instagram: 'instagram' } as const;

@Injectable()
export class AnalyticsChannelsService {
  constructor(
    @Inject(AnalyticsService) private readonly reports: AnalyticsService,
    @Inject(CampaignsService) private readonly campaigns: CampaignsService,
    @Inject(AutomationsService) private readonly automations: AutomationsService,
    @Inject(SocialAnalyticsService) private readonly social: SocialAnalyticsService,
  ) {}

  async channels(storeId: string, { period }: AnalyticsQuery): Promise<AnalyticsChannelsResponse> {
    const { timeZone, current } = await this.reports.periods(storeId, period);
    const [totals, people, revenue, orders, marketingRevenue, posts] = await Promise.all([
      readMessageTotals(this.campaigns, this.automations, storeId, { ...current, timeZone }),
      this.reports.channelPeople(storeId, current, timeZone),
      this.reports.marketingRevenueByChannel(storeId, current),
      this.reports.marketingOrdersByChannel(storeId, current),
      this.reports.marketingRevenue(storeId, current),
      this.social.publishedBetween(storeId, { ...current, timeZone }),
    ]);
    const money = (rows: { channel: string; value: bigint }[], channel: string) =>
      rows.reduce((sum, row) => (row.channel === channel ? sum + row.value : sum), 0n);
    const channels = campaignChannels.map((channel): AnalyticsChannelDetail => {
      const row = totals.get(channel) ?? emptyTotals();
      const reached = people.find((entry) => entry.channel === channel);
      const earned = money(revenue, channel);
      return {
        channel,
        revenuePoisha: earned.toString(),
        orders: Number(money(orders, channel)),
        sharePercent: percent(Number(earned), Number(marketingRevenue.total)),
        sent: row.sent,
        deliveredPercent: percent(row.delivered, row.sent),
        readPercent: READ_CHANNELS.includes(channel) ? percent(row.read, row.delivered) : null,
        tapPercent: percent(reached?.tapped ?? 0, reached?.delivered ?? 0),
        costPoisha: row.cost.toString(),
        costPerMessagePoisha:
          row.sent === 0
            ? null
            : ((row.cost * 2n + BigInt(row.sent)) / BigInt(row.sent * 2)).toString(),
        returnPerTaka: returnPerTaka(earned, row.cost),
      };
    });
    return {
      current,
      channels,
      social: {
        posts: posts.length,
        reach: posts.reduce((sum, post) => sum + (post.reach ?? 0), 0),
      },
    };
  }

  async socialPosts(
    storeId: string,
    { period }: AnalyticsQuery,
  ): Promise<AnalyticsSocialPostsResponse> {
    const { timeZone, current } = await this.reports.periods(storeId, period);
    const published = await this.social.publishedBetween(storeId, { ...current, timeZone });
    const posts = published
      .map((post) => ({
        id: post.id,
        caption: post.caption,
        networks: post.networks.flatMap((kind) =>
          kind in networks ? [networks[kind as keyof typeof networks]] : [],
        ),
        publishedAt: post.publishedAt.toISOString(),
        reach: post.reach,
        reactions: post.reactions,
        comments: post.comments,
        linkTaps: post.linkTaps,
      }))
      .sort((a, b) => (b.reach ?? -1) - (a.reach ?? -1));
    return {
      current,
      posts,
      totals: {
        reach: posts.reduce((sum, post) => sum + (post.reach ?? 0), 0),
        reactions: posts.reduce((sum, post) => sum + (post.reactions ?? 0), 0),
      },
    };
  }
}
