import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { CampaignSendingRepository } from './campaign-sending.repository';

const now = new Date('2026-11-16T05:00:00Z');

describe('campaign sending filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new CampaignSendingRepository(f.tenant, f.connection.db);
  let campaignA: string;
  beforeAll(async () => {
    await f.setup();
    campaignA = randomUUID();
    await f.connection.pool.query(
      `insert into campaigns(id,store_id,name,channel,content,status,scheduled_for,approved_at)
       values($1,$2,'ঈদের অফার','sms','{"text":"ঈদ"}','scheduled',$3,$3)`,
      [campaignA, f.a, now],
    );
  });
  afterAll(() => f.close());

  it('starts only the selected store’s campaigns', async () => {
    const before = await f.row('campaigns', campaignA);

    await repository.start(f.b, campaignA, now);
    expect(await f.row('campaigns', campaignA)).toEqual(before);
    await repository.start(f.a, campaignA, now);
    expect((await f.row('campaigns', campaignA)).status).toBe('sending');
  });
});
