import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { CampaignResultsRepository } from './campaign-results.repository';

describe('campaign results reads', () => {
  const f = new OwnerIsolationFixture();
  const results = new CampaignResultsRepository(f.tenant);
  const campaignId = randomUUID();
  const otherCampaignId = randomUUID();
  const query = (sql: string, values: unknown[]) => f.connection.pool.query(sql, values);
  const people = {
    ordered: randomUUID(),
    failedWithSms: randomUUID(),
    failedNoConsent: randomUUID(),
    optedOut: randomUUID(),
    foreign: randomUUID(),
  };

  async function contact(id: string, store: string, name: string, phone: string) {
    await query(
      "insert into contacts(id,store_id,name,phone,source,kind) values($1,$2,$3,$4,'manual','customer')",
      [id, store, name, phone],
    );
  }
  async function recipient(
    store: string,
    campaign: string,
    contactId: string,
    columns: Record<string, string>,
  ) {
    const names = ['id', 'store_id', 'campaign_id', 'contact_id', ...Object.keys(columns)];
    const values = [randomUUID(), store, campaign, contactId, ...Object.values(columns)];
    await query(
      `insert into campaign_recipients(${names.join(',')})
       values(${values.map((_, index) => `$${index + 1}`).join(',')})`,
      values,
    );
  }
  async function consent(
    store: string,
    contactId: string,
    status: string,
    source: string,
    at: string,
  ) {
    await query(
      `insert into consents(id,store_id,contact_id,channel,status,source,captured_at)
       values($1,$2,$3,'sms',$4,$5,$6)`,
      [randomUUID(), store, contactId, status, source, at],
    );
  }

  beforeAll(async () => {
    await f.setup();
    for (const [id, store] of [
      [campaignId, f.a],
      [otherCampaignId, f.b],
    ] as const)
      await query(
        `insert into campaigns(id,store_id,name,channel,content,status)
         values($1,$2,'অফার','messenger','{}','draft')`,
        [id, store],
      );
    await contact(people.ordered, f.a, 'রিনা', '01710000001');
    await contact(people.failedWithSms, f.a, 'সুমি', '01710000002');
    await contact(people.failedNoConsent, f.a, 'মিতা', '01710000003');
    await contact(people.optedOut, f.a, 'নিপা', '01710000004');
    await contact(people.foreign, f.b, 'করিমের ক্রেতা', '01710000005');

    await recipient(f.a, campaignId, people.ordered, {
      status: 'read',
      sent_at: '2026-11-10T04:00:00Z',
      read_at: '2026-11-10T05:00:00Z',
      tapped_at: '2026-11-10T05:05:00Z',
    });
    await recipient(f.a, campaignId, people.failedWithSms, {
      status: 'failed',
      error_code: 'recipient_unreachable',
    });
    await recipient(f.a, campaignId, people.failedNoConsent, {
      status: 'failed',
      error_code: 'recipient_unreachable',
    });
    await recipient(f.a, campaignId, people.optedOut, {
      status: 'delivered',
      sent_at: '2026-11-10T04:00:00Z',
      delivered_at: '2026-11-10T04:01:00Z',
    });
    await recipient(f.b, otherCampaignId, people.foreign, {
      status: 'failed',
      error_code: 'recipient_unreachable',
    });

    await consent(f.a, people.failedWithSms, 'granted', 'checkout', '2026-11-01T00:00:00Z');
    await consent(f.a, people.failedNoConsent, 'withdrawn', 'manual', '2026-11-01T00:00:00Z');
    await consent(f.a, people.optedOut, 'granted', 'checkout', '2026-11-01T00:00:00Z');
    await consent(f.a, people.optedOut, 'withdrawn', 'opt_out_link', '2026-11-10T04:30:00Z');
    await consent(f.b, people.foreign, 'granted', 'checkout', '2026-11-01T00:00:00Z');
  });

  afterAll(async () => {
    await f.close();
  });

  it('reads cost, failure reasons, SMS fallback and opt-outs for the campaign store only', async () => {
    expect(await results.findSummary(f.a, campaignId)).toMatchObject({ channel: 'messenger' });
    expect(await results.findSummary(f.b, campaignId)).toBeUndefined();
    expect(await results.failureReasons(f.a, campaignId)).toEqual([
      { code: 'recipient_unreachable', count: 2 },
    ]);
    expect(await results.failureReasons(f.b, campaignId)).toEqual([]);
    expect(await results.smsFallbackCount(f.a, campaignId)).toBe(1);
    expect(await results.smsFallbackCount(f.b, campaignId)).toBe(0);
    expect(await results.optedOutCount(f.a, campaignId)).toBe(1);
    expect(await results.optedOutCount(f.b, campaignId)).toBe(0);
  });

  it('lists people by outcome, pages them, and never shows another store', async () => {
    const page = { limit: 10 };
    const names = async (store: string, outcome: Parameters<typeof results.customers>[2]) =>
      (await results.customers(store, campaignId, outcome, page)).map(({ name }) => name);
    expect(await names(f.a, 'tapped')).toEqual(['রিনা']);
    expect(await names(f.a, 'read')).toEqual(['রিনা']);
    expect((await names(f.a, 'delivered')).sort()).toEqual(['নিপা', 'রিনা']);
    expect((await names(f.a, 'failed')).sort()).toEqual(['মিতা', 'সুমি']);
    expect(await names(f.a, 'opted_out')).toEqual(['নিপা']);
    expect(await names(f.b, 'failed')).toEqual([]);
    const first = await results.customers(f.a, campaignId, 'failed', { limit: 1 });
    expect(first).toHaveLength(2);
    const next = await results.customers(f.a, campaignId, 'failed', {
      limit: 1,
      cursor: first[0]!.id,
    });
    expect(next.map(({ id }) => id)).toEqual([first[1]!.id]);
  });
});
