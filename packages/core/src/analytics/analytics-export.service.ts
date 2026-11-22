import { Inject, Injectable } from '@nestjs/common';

import type { AnalyticsExportQuery } from '@dakly/contracts/analytics';
import { poishaToTakaText } from '@dakly/contracts/money';

import { AuditService } from '../audit/audit.service';
import { csvCell } from '../platform/csv-cell';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AnalyticsChannelsService } from './analytics-channels.service';
import { AnalyticsTabsService } from './analytics-tabs.service';

type Cell = string | number | null;
type Table = { header: string[]; rows: Cell[][] };

const UTF8_BOM = '﻿';

@Injectable()
export class AnalyticsExportService {
  constructor(
    @Inject(AnalyticsTabsService) private readonly tabs: AnalyticsTabsService,
    @Inject(AnalyticsChannelsService) private readonly channels: AnalyticsChannelsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
  ) {}

  async export(storeId: string, userId: string, { tab, period }: AnalyticsExportQuery) {
    const { range, table } = await this.table(storeId, tab, period);
    await this.transaction.run(storeId, () =>
      this.audit.record(storeId, {
        actor: { kind: 'user', userId },
        action: 'analytics.exported',
        entityType: 'store',
        entityId: storeId,
        after: { state: `${tab}_${period}d` },
      }),
    );
    const lines = [table.header, ...table.rows].map((row) =>
      row.map((cell) => csvCell(cell ?? '')).join(','),
    );
    return {
      filename: `dakly-analytics-${tab}-${range.from}-${range.through}.csv`,
      // The BOM makes Excel read Bangla captions as UTF-8.
      body: UTF8_BOM + lines.join('\r\n') + '\r\n',
    };
  }

  private async table(storeId: string, tab: AnalyticsExportQuery['tab'], period: 30 | 90 | 365) {
    if (tab === 'campaigns') return this.campaignTable(storeId, period);
    if (tab === 'automations') return this.automationTable(storeId, period);
    if (tab === 'social') return this.socialTable(storeId, period);
    // The Overview tab has no table of its own, so it downloads the per-channel figures behind its chart.
    return this.channelTable(storeId, period);
  }

  private async campaignTable(storeId: string, period: 30 | 90 | 365) {
    const { current, campaigns } = await this.tabs.campaignsTab(storeId, { period });
    return {
      range: current,
      table: {
        header: [
          'Campaign ID',
          'Campaign',
          'Channel',
          'Started',
          'Sent',
          'Delivered',
          'Read',
          'Cost (BDT)',
          'Tap rate (%)',
          'Orders',
          'Money earned (BDT)',
          'Return per 1 BDT',
        ],
        rows: campaigns.map((row) => [
          row.id,
          row.name,
          row.channel,
          row.startedAt,
          row.sent,
          row.delivered,
          row.read,
          poishaToTakaText(row.costPoisha),
          row.tapPercent,
          row.orders,
          poishaToTakaText(row.revenuePoisha),
          row.returnPerTaka,
        ]),
      },
    };
  }

  private async automationTable(storeId: string, period: 30 | 90 | 365) {
    const { current, automations } = await this.tabs.automationsTab(storeId, { period });
    return {
      range: current,
      table: {
        header: [
          'Automation ID',
          'Automation',
          'Status',
          'Channels',
          'People entered',
          'Messages sent',
          'Cost (BDT)',
          'Orders',
          'Money earned (BDT)',
          'Ordered (%)',
          'Return per 1 BDT',
        ],
        rows: automations.map((row) => [
          row.id,
          row.name,
          row.isActive ? 'Active' : 'Paused',
          row.channels.join(' '),
          row.entered,
          row.sent,
          poishaToTakaText(row.costPoisha),
          row.orders,
          poishaToTakaText(row.revenuePoisha),
          row.orderedPercent,
          row.returnPerTaka,
        ]),
      },
    };
  }

  private async channelTable(storeId: string, period: 30 | 90 | 365) {
    const { current, channels } = await this.channels.channels(storeId, { period });
    const table: Table = {
      header: [
        'Channel',
        'Money earned (BDT)',
        'Orders',
        'Share of marketing money (%)',
        'Sent',
        'Delivered (%)',
        'Read (%)',
        'Tapped (%)',
        'Cost (BDT)',
        'Cost per message (BDT)',
        'Return per 1 BDT',
      ],
      rows: channels.map((row) => [
        row.channel,
        poishaToTakaText(row.revenuePoisha),
        row.orders,
        row.sharePercent,
        row.sent,
        row.deliveredPercent,
        row.readPercent,
        row.tapPercent,
        poishaToTakaText(row.costPoisha),
        row.costPerMessagePoisha === null ? null : poishaToTakaText(row.costPerMessagePoisha),
        row.returnPerTaka,
      ]),
    };
    return { range: current, table };
  }

  private async socialTable(storeId: string, period: 30 | 90 | 365) {
    const { current, posts } = await this.channels.socialPosts(storeId, { period });
    const table: Table = {
      header: [
        'Post ID',
        'Caption',
        'Networks',
        'Published',
        'Reach',
        'Reactions',
        'Comments',
        'Link taps',
      ],
      rows: posts.map((post) => [
        post.id,
        post.caption,
        post.networks.join(' '),
        post.publishedAt,
        post.reach,
        post.reactions,
        post.comments,
        post.linkTaps,
      ]),
    };
    return { range: current, table };
  }
}
