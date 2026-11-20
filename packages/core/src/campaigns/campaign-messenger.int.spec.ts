import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCampaignSchema } from '@dakly/contracts/campaigns';
import { createDatabase } from '@dakly/db/client';

import { DatabaseModule } from '../platform/database/database.module';
import { SegmentsService } from '../segments/segments.service';
import { CampaignAudienceService } from './campaign-audience.service';
import { CampaignsModule } from './campaigns.module';
import { CampaignsService } from './campaigns.service';

class TestModule {}
Module({ imports: [DatabaseModule, CampaignsModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const otherStoreId = randomUUID();
const userId = randomUUID();
const actor = { kind: 'user', userId } as const;
const HOUR = 60 * 60 * 1000;
let app: INestApplicationContext;
let service: CampaignsService;
let segmentId: string;
const pages = { first: randomUUID(), second: randomUUID(), instagram: randomUUID() };
const names = ['open', 'closed', 'otherPageOnly', 'bothPages', 'noConsent'] as const;
const contacts = Object.fromEntries(names.map((name) => [name, randomUUID()])) as Record<
  (typeof names)[number],
  string
>;

async function connect(id: string, kind: string, store = storeId) {
  await admin.pool.query(
    "insert into channel_connections(id,store_id,kind,external_account_id,display_name,connected_at) values($1::uuid,$2,$3,$1::text,'পেজ', now() - interval '30 days')",
    [id, store, kind],
  );
}

// The contact wrote to the Page `hoursAgo` hours ago; its id on that Page is `psid`.
async function wroteToPage(contactId: string, pageId: string, psid: string, hoursAgo: number) {
  await admin.pool.query(
    "insert into contact_identities(id,store_id,contact_id,channel_connection_id,channel,external_id) values(gen_random_uuid(),$1,$2,$3,'messenger',$4)",
    [storeId, contactId, pageId, psid],
  );
  await admin.pool.query(
    "insert into conversations(id,store_id,contact_id,channel_connection_id,channel,last_inbound_at) values(gen_random_uuid(),$1,$2,$3,'messenger',$4)",
    [storeId, contactId, pageId, new Date(Date.now() - hoursAgo * HOUR)],
  );
}

async function draft(channelConnectionId: string) {
  return service.create(
    storeId,
    createCampaignSchema.parse({
      name: 'মেসেঞ্জার অফার',
      channel: 'messenger',
      channelConnectionId,
      content: { text: 'আজ ১০% ছাড়', imageUrl: null, buttons: [{ title: 'দেখুন' }] },
      includeSegmentIds: [segmentId],
    }),
    actor,
  );
}

describe('Messenger campaigns (Postgres)', () => {
  beforeAll(async () => {
    for (const id of [storeId, otherStoreId])
      await admin.pool.query("insert into stores(id,name) values($1,'রিনার দোকান')", [id]);
    await admin.pool.query(
      "insert into users(id,name,email) values($1::uuid,'রিনা',$1::text || '@example.test')",
      [userId],
    );
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    service = app.get(CampaignsService);
    await connect(pages.first, 'facebook_page');
    await connect(pages.second, 'facebook_page');
    await connect(pages.instagram, 'instagram');
    for (const [name, id] of Object.entries(contacts)) {
      await admin.pool.query(
        "insert into contacts(id,store_id,name,source,kind,district) values($1,$2,$3,'messenger','customer','ঢাকা')",
        [id, storeId, name],
      );
      if (name !== 'noConsent')
        await admin.pool.query(
          "insert into consents(id,store_id,contact_id,channel,status,source) values(gen_random_uuid(),$1,$2,'messenger','granted','checkout')",
          [storeId, id],
        );
    }
    await wroteToPage(contacts.open, pages.first, 'psid-open', 2);
    await wroteToPage(contacts.closed, pages.first, 'psid-closed', 23.5);
    await wroteToPage(contacts.otherPageOnly, pages.second, 'psid-other-only', 1);
    await wroteToPage(contacts.bothPages, pages.first, 'psid-both-first', 30);
    await wroteToPage(contacts.bothPages, pages.second, 'psid-both-second', 1);
    await wroteToPage(contacts.noConsent, pages.first, 'psid-no-consent', 1);
    const rules = {
      match: 'all',
      conditions: [{ field: 'district', operator: 'is_any_of', values: ['ঢাকা'] }],
    } as const;
    segmentId = (await app.get(SegmentsService).create(storeId, { name: 'ঢাকা', rules }, actor)).id;
  });

  afterAll(async () => {
    try {
      await app?.close();
      const stores = [storeId, otherStoreId];
      for (const table of [
        'campaign_recipients',
        'campaigns',
        'conversations',
        'contact_identities',
        'consents',
        'segments',
        'contacts',
        'channel_connections',
      ])
        await admin.pool.query(`delete from ${table} where store_id = any($1::uuid[])`, [stores]);
      await admin.pool.query('delete from audit_log where store_id = any($1::uuid[])', [stores]);
      await admin.pool.query('delete from stores where id = any($1::uuid[])', [stores]);
      await admin.pool.query('delete from users where id = $1', [userId]);
    } finally {
      await admin.pool.end();
    }
  });

  it('counts only people whose last message to the selected Page is under 23 hours old', async () => {
    const campaign = await draft(pages.first);
    expect(campaign).toMatchObject({ channel: 'messenger', channelConnectionId: pages.first });
    const estimate = await service.estimate(storeId, campaign.id);
    expect(estimate).toMatchObject({
      isComplete: true,
      audienceCount: 5,
      recipientsCount: 1,
      smsCredits: 0,
      costPoisha: 0,
      skippedByReason: { window_closed: 2, no_address: 1, no_consent: 1 },
    });
  });

  it('uses the identity on the selected Page for a contact on two Pages', async () => {
    const first = await draft(pages.first);
    const second = await draft(pages.second);
    // The contact on both Pages wrote 30 hours ago on the first and 1 hour ago on the second.
    expect(await service.estimate(storeId, first.id)).toMatchObject({
      recipientsCount: 1,
      skippedByReason: { window_closed: 2, no_address: 1, no_consent: 1 },
    });
    expect(await service.estimate(storeId, second.id)).toMatchObject({
      recipientsCount: 2,
      skippedByReason: { no_address: 2, no_consent: 1 },
    });
  });

  it('freezes the contact’s id on the selected Page as the destination', async () => {
    const second = await draft(pages.second);
    const page = await app
      .get(CampaignAudienceService)
      .page(storeId, second, { segmentIndex: 0, contactId: null }, new Date());
    const both = page.recipients.find(({ contactId }) => contactId === contacts.bothPages);
    expect(both).toMatchObject({ status: 'queued', destinationAddress: 'psid-both-second' });
    expect(both?.contactIdentityId).toEqual(expect.any(String));
  });

  it('refuses a Page that is not a connected Facebook Page of this shop', async () => {
    await expect(draft(pages.instagram)).rejects.toMatchObject({
      code: 'CHANNEL_CONNECTION_NOT_FOUND',
    });
    await expect(draft(randomUUID())).rejects.toMatchObject({
      code: 'CHANNEL_CONNECTION_NOT_FOUND',
    });
    const foreign = randomUUID();
    await connect(foreign, 'facebook_page', otherStoreId);
    await expect(draft(foreign)).rejects.toMatchObject({ code: 'CHANNEL_CONNECTION_NOT_FOUND' });
  });

  it('keeps each channel to its own content and Page', async () => {
    const messenger = await draft(pages.first);
    await expect(
      service.changeDraft(storeId, messenger.id, { content: { text: 'শুধু লেখা' } }, actor),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_CHANGE_NOT_FOR_CHANNEL' });
    const changed = await service.changeDraft(
      storeId,
      messenger.id,
      { channelConnectionId: pages.second },
      actor,
    );
    expect(changed.channelConnectionId).toBe(pages.second);
    const sms = await service.create(
      storeId,
      createCampaignSchema.parse({ name: 'এসএমএস', channel: 'sms' }),
      actor,
    );
    await expect(
      service.changeDraft(storeId, sms.id, { channelConnectionId: pages.first }, actor),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_CHANGE_NOT_FOR_CHANNEL' });
  });

  it('rejects a fourth button, a long button title and an image that is not https', () => {
    const base = { name: 'x', channel: 'messenger', channelConnectionId: pages.first } as const;
    const content = { text: 'a', imageUrl: null, buttons: [] };
    const parse = (change: object) =>
      createCampaignSchema.safeParse({ ...base, content: { ...content, ...change } }).success;
    expect(parse({ buttons: [1, 2, 3, 4].map((n) => ({ title: `t${n}` })) })).toBe(false);
    expect(parse({ buttons: [{ title: 'a'.repeat(21) }] })).toBe(false);
    expect(parse({ imageUrl: 'http://cdn.example.test/a.jpg' })).toBe(false);
    expect(parse({ imageUrl: 'https://cdn.example.test/a.jpg' })).toBe(true);
  });
});
