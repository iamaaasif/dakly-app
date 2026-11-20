import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { CampaignMessageTotalsRepository } from './campaign-message-totals.repository';

describe('campaign message totals', () => {
  const f = new OwnerIsolationFixture();
  const repository = new CampaignMessageTotalsRepository(f.tenant);
  const range = { from: '2026-11-10', through: '2026-11-10', timeZone: 'Asia/Dhaka' };

  async function recipient(store: string, campaign: string, contact: string, values: string) {
    await f.connection.pool.query(
      `insert into campaign_recipients(id,store_id,campaign_id,contact_id,status,${values.split('|')[0]})
       values($1,$2,$3,$4,'sent',${values.split('|')[1]})`,
      [randomUUID(), store, campaign, contact],
    );
  }

  beforeAll(async () => {
    await f.setup();
    const [sms, whatsapp, other] = Array.from({ length: 3 }, () => randomUUID());
    const contacts = Array.from({ length: 4 }, () => randomUUID());
    for (const contact of contacts)
      await f.connection.pool.query(
        "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা','manual','customer')",
        [contact, contact === contacts[3] ? f.b : f.a],
      );
    for (const [id, store, channel] of [
      [sms, f.a, 'sms'],
      [whatsapp, f.a, 'whatsapp'],
      [other, f.b, 'sms'],
    ])
      await f.connection.pool.query(
        "insert into campaigns(id,store_id,name,channel,content) values($1,$2,'অফার',$3,'{}')",
        [id, store, channel],
      );
    // 2026-11-09T18:00Z is 00:00 on 10 November in Dhaka, so it is the first instant in range.
    await recipient(
      f.a,
      sms,
      contacts[0]!,
      "sent_at,delivered_at,tapped_at,cost_poisha|'2026-11-09T18:00:00Z','2026-11-09T18:01:00Z','2026-11-09T19:00:00Z',35",
    );
    await recipient(f.a, sms, contacts[1]!, "sent_at,cost_poisha|'2026-11-10T17:59:59Z',35");
    await recipient(f.a, sms, contacts[2]!, "sent_at,cost_poisha|'2026-11-10T18:00:00Z',35");
    await recipient(
      f.a,
      whatsapp,
      contacts[0]!,
      "sent_at,delivered_at,read_at,cost_poisha|'2026-11-10T06:00:00Z','2026-11-10T06:01:00Z','2026-11-10T07:00:00Z',95",
    );
    await recipient(f.b, other, contacts[3]!, "sent_at,cost_poisha|'2026-11-10T06:00:00Z',35");
  });

  afterAll(async () => {
    await f.connection.pool.query(
      'delete from campaign_recipients where store_id=any($1::uuid[])',
      [[f.a, f.b]],
    );
    await f.close();
  });

  it('counts each channel inside the shop-local day and leaves other stores out', async () => {
    const rows = await repository.messageTotals(f.a, range);
    expect(rows.sort((a, b) => a.channel.localeCompare(b.channel))).toEqual([
      { channel: 'sms', sent: 2, delivered: 1, read: 0, costPoisha: '70' },
      { channel: 'whatsapp', sent: 1, delivered: 1, read: 1, costPoisha: '95' },
    ]);
  });
});
