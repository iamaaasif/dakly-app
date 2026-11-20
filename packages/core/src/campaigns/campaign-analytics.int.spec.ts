import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { CampaignAnalyticsRepository } from './campaign-analytics.repository';

describe('campaign analytics read', () => {
  const f = new OwnerIsolationFixture();
  const campaigns = new CampaignAnalyticsRepository(f.tenant);
  const range = { from: '2026-11-10', through: '2026-11-10', timeZone: 'Asia/Dhaka' };
  const query = (sql: string, values: unknown[]) => f.connection.pool.query(sql, values);

  beforeAll(async () => {
    await f.setup();
    // 2026-11-09T18:00Z is the first instant of 10 November in Dhaka.
    for (const [name, store, startedAt, sent] of [
      ['inside', f.a, '2026-11-09T18:00:00Z', 10],
      ['before', f.a, '2026-11-09T17:59:59Z', 10],
      ['after', f.a, '2026-11-10T18:00:00Z', 10],
      ['never sent', f.a, '2026-11-10T06:00:00Z', 0],
      ['other store', f.b, '2026-11-10T06:00:00Z', 10],
    ] as const)
      await query(
        `insert into campaigns(id,store_id,name,channel,content,sent_count,started_at,actual_cost_poisha)
         values($1,$2,$3,'sms','{}',$4,$5,350)`,
        [randomUUID(), store, name, sent, startedAt],
      );
  });

  afterAll(async () => {
    await f.close();
  });

  it('lists campaigns that started inside the shop-local day with their counts, for one store', async () => {
    const rows = await campaigns.startedBetween(f.a, range);
    expect(rows.map(({ name }) => name)).toEqual(['inside']);
    expect(rows[0]).toMatchObject({ sent: 10, costPoisha: 350, channel: 'sms' });
  });
});
