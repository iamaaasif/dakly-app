import { describe, expect, it } from 'vitest';

import type { AutomationsService } from '../automations/automations.service';
import type { CampaignsService } from '../campaigns/campaigns.service';
import type { PublishedPost, SocialAnalyticsService } from '../social/social-analytics.service';
import { AnalyticsChannelsService } from './analytics-channels.service';
import type { AnalyticsService } from './analytics.service';

const current = { from: '2026-11-01', through: '2026-11-30' };

function post(values: Partial<PublishedPost>): PublishedPost {
  return {
    id: 'post',
    caption: 'Eid sale',
    networks: ['facebook_page'],
    publishedAt: new Date('2026-11-10T06:00:00Z'),
    reach: null,
    reactions: null,
    comments: null,
    linkTaps: null,
    ...values,
  };
}

function service(posts: PublishedPost[] = []) {
  const reports = {
    periods: async () => ({ timeZone: 'Asia/Dhaka', current }),
    channelPeople: async () => [{ channel: 'whatsapp', delivered: 40, tapped: 10 }],
    marketingRevenueByChannel: async () => [
      { day: '2026-11-02', channel: 'whatsapp', value: 6_000_000n },
      { day: '2026-11-03', channel: 'whatsapp', value: 1_000_000n },
      { day: '2026-11-03', channel: 'sms', value: 3_000_000n },
    ],
    marketingOrdersByChannel: async () => [
      { channel: 'whatsapp', value: 5n },
      { channel: 'whatsapp', value: 2n },
      { channel: 'sms', value: 3n },
    ],
    marketingRevenue: async () => ({ total: 10_000_000n }),
  } as unknown as AnalyticsService;
  return new AnalyticsChannelsService(
    reports,
    {
      messageTotals: async () => [
        { channel: 'whatsapp', sent: 50, delivered: 40, read: 30, costPoisha: '4750' },
        { channel: 'sms', sent: 3, delivered: 3, read: 0, costPoisha: '100' },
      ],
    } as unknown as CampaignsService,
    { messageTotals: async () => [] } as unknown as AutomationsService,
    { publishedBetween: async () => posts } as unknown as SocialAnalyticsService,
  );
}

describe('analytics channels', () => {
  it('shows money share, rates and cost per message for each channel', async () => {
    const { channels } = await service().channels('store', { period: 30 });
    expect(channels.find(({ channel }) => channel === 'whatsapp')).toEqual({
      channel: 'whatsapp',
      revenuePoisha: '7000000',
      orders: 7,
      sharePercent: 70,
      sent: 50,
      deliveredPercent: 80,
      readPercent: 75,
      tapPercent: 25,
      costPoisha: '4750',
      costPerMessagePoisha: '95',
      returnPerTaka: 1474,
    });
  });

  it('has no read rate for SMS and nothing to divide for a channel that sent nothing', async () => {
    const { channels } = await service().channels('store', { period: 30 });
    expect(channels.find(({ channel }) => channel === 'sms')).toMatchObject({
      readPercent: null,
      costPerMessagePoisha: '33',
    });
    expect(channels.find(({ channel }) => channel === 'messenger')).toMatchObject({
      sent: 0,
      deliveredPercent: null,
      costPerMessagePoisha: null,
      returnPerTaka: null,
    });
  });

  it('adds up post reach for the social card', async () => {
    const { social } = await service([
      post({ reach: 100 }),
      post({ id: 'b', reach: null }),
    ]).channels('store', { period: 30 });
    expect(social).toEqual({ posts: 2, reach: 100 });
  });

  it('ranks posts by reach and names the networks', async () => {
    const result = await service([
      post({ id: 'quiet', reach: 10, reactions: 1 }),
      post({ id: 'busy', reach: 500, reactions: 40, networks: ['facebook_page', 'instagram'] }),
      post({ id: 'waiting' }),
    ]).socialPosts('store', { period: 30 });
    expect(result.posts.map(({ id }) => id)).toEqual(['busy', 'quiet', 'waiting']);
    expect(result.posts[0]?.networks).toEqual(['facebook', 'instagram']);
    expect(result.posts[2]?.reach).toBeNull();
    expect(result.totals).toEqual({ reach: 510, reactions: 41 });
  });
});
