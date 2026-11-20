import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { AnalyticsRepository } from './analytics.repository';

describe('people reached by messages', () => {
  const f = new OwnerIsolationFixture();
  const repository = new AnalyticsRepository(f.tenant);
  const range = { from: '2026-11-10', through: '2026-11-10', timeZone: 'Asia/Dhaka' };
  const db = f.connection.pool;

  beforeAll(async () => {
    await f.setup();
    const [rina, karim, outside, other] = Array.from({ length: 4 }, () => randomUUID());
    const [campaign, workflow, version, run, otherCampaign] = Array.from({ length: 5 }, () =>
      randomUUID(),
    );
    for (const [id, store] of [
      [rina, f.a],
      [karim, f.a],
      [outside, f.a],
      [other, f.b],
    ])
      await db.query(
        "insert into contacts(id,store_id,name,source,kind) values($1,$2,'গ্রাহক','manual','customer')",
        [id, store],
      );
    for (const [id, store] of [
      [campaign, f.a],
      [otherCampaign, f.b],
    ])
      await db.query(
        "insert into campaigns(id,store_id,name,channel,content) values($1,$2,'অফার','sms','{}')",
        [id, store],
      );
    await db.query(
      "insert into automations(id,store_id,name,trigger_type,draft_graph) values($1,$2,'Flow','manual','{}')",
      [workflow, f.a],
    );
    await db.query(
      "insert into automation_versions(id,store_id,automation_id,version,graph) values($1,$2,$3,1,'{}')",
      [version, f.a, workflow],
    );
    for (const contact of [rina, karim, outside])
      await db.query(
        `insert into automation_runs(id,store_id,automation_id,version_id,contact_id,trigger_key,current_step_key,wake_at)
         values($1,$2,$3,$4,$5,'manual','offer','2026-11-20T06:00:00Z')`,
        [contact === rina ? run : randomUUID(), f.a, workflow, version, contact],
      );
    const sent = '2026-11-10T06:00:00Z';
    // Rina tapped both a campaign and a workflow link; Karim was delivered to and did not tap.
    const campaignRows = [
      [f.a, campaign, rina, sent, sent, sent],
      [f.a, campaign, karim, sent, sent, null],
      [f.a, campaign, outside, '2026-11-12T06:00:00Z', '2026-11-12T06:00:00Z', null],
      [f.b, otherCampaign, other, sent, sent, sent],
    ] as const;
    for (const [store, id, contact, sentAt, deliveredAt, tappedAt] of campaignRows)
      await db.query(
        `insert into campaign_recipients(id,store_id,campaign_id,contact_id,status,sent_at,delivered_at,tapped_at)
         values($1,$2,$3,$4,'sent',$5,$6,$7)`,
        [randomUUID(), store, id, contact, sentAt, deliveredAt, tappedAt],
      );
    await db.query(
      `insert into automation_run_steps(id,store_id,run_id,contact_id,step_key,kind,outcome,channel,category,sent_at,delivered_at,tapped_at)
       values($1,$2,$3,$4,'offer','send','sent','sms','marketing',$5,$5,$5)`,
      [randomUUID(), f.a, run, rina, sent],
    );
  });

  afterAll(async () => {
    await db.query('delete from campaign_recipients where store_id=any($1::uuid[])', [[f.a, f.b]]);
    await db.query('delete from automation_run_steps where store_id=any($1::uuid[])', [[f.a, f.b]]);
    await f.close();
  });

  it('counts a person who tapped a campaign and a workflow link once', async () => {
    expect(await repository.messagePeople(f.a, range)).toEqual({ delivered: 2, tapped: 1 });
  });

  it('leaves other stores and days out', async () => {
    expect(await repository.messagePeople(f.b, { ...range, through: '2026-11-09' })).toEqual({
      delivered: 0,
      tapped: 0,
    });
  });
});
