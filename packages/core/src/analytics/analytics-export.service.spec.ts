import { describe, expect, it } from 'vitest';

import type { AuditService } from '../audit/audit.service';
import type { StoreTransaction } from '../platform/database/store-transaction';
import type { AnalyticsChannelsService } from './analytics-channels.service';
import { AnalyticsExportService } from './analytics-export.service';
import type { AnalyticsTabsService } from './analytics-tabs.service';

const current = { from: '2026-11-01', through: '2026-11-30' };

function service(recorded: unknown[] = []) {
  const tabs = {
    campaignsTab: async () => ({
      current,
      campaigns: [
        {
          id: 'c1',
          name: '=Eid "sale"',
          channel: 'whatsapp',
          startedAt: '2026-11-05T04:00:00.000Z',
          sent: 50,
          delivered: 40,
          read: 30,
          costPoisha: '4750',
          tapPercent: null,
          orders: 3,
          revenuePoisha: '123456',
          returnPerTaka: 26,
        },
      ],
    }),
  } as unknown as AnalyticsTabsService;
  const audit = { record: async (_store: string, entry: unknown) => void recorded.push(entry) };
  return new AnalyticsExportService(
    tabs,
    {} as AnalyticsChannelsService,
    audit as unknown as AuditService,
    { run: (_store: string, work: () => unknown) => work() } as unknown as StoreTransaction,
  );
}

describe('analytics export', () => {
  it('writes a UTF-8 file with delivered, read and cost, money in taka and ids', async () => {
    const { filename, body } = await service().export('store', 'user', {
      tab: 'campaigns',
      period: 30,
    });
    expect(filename).toBe('dakly-analytics-campaigns-2026-11-01-2026-11-30.csv');
    expect(body.split('\r\n')).toEqual([
      '﻿"Campaign ID","Campaign","Channel","Started","Sent","Delivered","Read","Cost (BDT)","Tap rate (%)","Orders","Money earned (BDT)","Return per 1 BDT"',
      '"c1","\'=Eid ""sale""","whatsapp","2026-11-05T04:00:00.000Z","50","40","30","47.50","","3","1234.56","26"',
      '',
    ]);
  });

  it('records who downloaded which tab', async () => {
    const recorded: unknown[] = [];
    await service(recorded).export('store', 'user', { tab: 'campaigns', period: 90 });
    expect(recorded).toMatchObject([
      {
        action: 'analytics.exported',
        actor: { userId: 'user' },
        after: { state: 'campaigns_90d' },
      },
    ]);
  });
});
