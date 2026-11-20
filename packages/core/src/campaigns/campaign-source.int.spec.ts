import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { DatabaseModule } from '../platform/database/database.module';
import { CampaignAudienceService } from './campaign-audience.service';
import { CampaignSourceService } from './campaign-source.service';
import { CampaignsModule } from './campaigns.module';
import { CampaignsService } from './campaigns.service';

class TestModule {}
Module({ imports: [DatabaseModule, CampaignsModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const userId = randomUUID();
const actor = { kind: 'user', userId } as const;
const person = {
  unread: randomUUID(),
  read: randomUUID(),
  tappedOrdered: randomUUID(),
  tappedOnly: randomUUID(),
};
const sentId = randomUUID();
const draftId = randomUUID();
const smsSentId = randomUUID();
const pageId = randomUUID();
let app: INestApplicationContext;
let sources: CampaignSourceService;
let campaigns: CampaignsService;
let audience: CampaignAudienceService;

const query = (sql: string, values: unknown[]) => admin.pool.query(sql, values);

async function contact(id: string, name: string, phone: string) {
  await query(
    "insert into contacts(id,store_id,name,phone,source,kind) values($1,$2,$3,$4,'manual','customer')",
    [id, storeId, name, phone],
  );
}
async function recipient(contactId: string, status: string, tappedAt: string | null = null) {
  await query(
    `insert into campaign_recipients(id,store_id,campaign_id,contact_id,status,sent_at,delivered_at,read_at,tapped_at)
     values($1,$2,$3,$4,$5,now(),now(),case when $5 = 'read' then now() end,$6)`,
    [randomUUID(), storeId, sentId, contactId, status, tappedAt],
  );
}
async function firstPage(campaignId: string) {
  const campaign = await campaigns.get(storeId, campaignId);
  const page = await audience.page(
    storeId,
    {
      channel: 'sms',
      channelConnectionId: null,
      includeSegmentIds: campaign.includeSegmentIds,
      excludeSegmentIds: [],
      sourceCampaignId: campaign.source?.campaignId ?? null,
      sourceOutcome: campaign.source?.outcome ?? null,
    },
    { segmentIndex: 0, contactId: null },
    new Date(),
  );
  return { ids: page.recipients.map(({ contactId }) => contactId).sort(), page };
}

describe('resend and follow-up drafts (Postgres)', () => {
  beforeAll(async () => {
    await query("insert into stores(id,name) values($1,'রিনার দোকান')", [storeId]);
    await query(
      "insert into users(id,name,email) values($1::uuid,'রিনা',$1::text || '@example.test')",
      [userId],
    );
    await query(
      `insert into channel_connections(id,store_id,kind,external_account_id,display_name,connected_at)
       values($1::uuid,$2,'facebook_page',$1::text,'পেজ', now() - interval '30 days')`,
      [pageId, storeId],
    );
    await query(
      `insert into campaigns(id,store_id,name,channel,channel_connection_id,content,status,finished_at)
       values($1,$2,'ঈদের অফার','messenger',$3,'{"text":"ঈদে ২০% ছাড়"}','sent',now() - interval '1 hour')`,
      [sentId, storeId, pageId],
    );
    await query(
      `insert into campaigns(id,store_id,name,channel,content,status,finished_at)
       values($1,$2,'এসএমএস অফার','sms','{"text":"ঈদে ২০% ছাড়"}','sent',now() - interval '72 hours')`,
      [smsSentId, storeId],
    );
    await contact(person.unread, 'রিনা', '01710000001');
    await contact(person.read, 'সুমি', '01710000002');
    await contact(person.tappedOrdered, 'মিতা', '01710000003');
    await contact(person.tappedOnly, 'নিপা', '01710000004');
    await recipient(person.unread, 'delivered');
    await recipient(person.read, 'read');
    await recipient(person.tappedOrdered, 'delivered', '2026-11-10T05:00:00Z');
    await recipient(person.tappedOnly, 'read', '2026-11-10T05:00:00Z');
    await query(
      `insert into orders(id,store_id,number,source,created_by_type,buyer_contact_id,
        recipient_name,recipient_phone,recipient_address,recipient_district,items_subtotal_poisha,
        cod_amount_poisha,attributed_source_type,attributed_source_id,attributed_amount_poisha)
       values($1,$2,1,'manual','user',$3,'x','01710000009','Mirpur','Dhaka',125000,125000,
        'campaign',$4,125000)`,
      [randomUUID(), storeId, person.tappedOrdered, sentId],
    );
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    sources = app.get(CampaignSourceService);
    campaigns = app.get(CampaignsService);
    audience = app.get(CampaignAudienceService);
  });

  afterAll(async () => {
    try {
      await app?.close();
      await query('delete from orders where store_id=$1', [storeId]);
      await query('delete from campaigns where store_id=$1', [storeId]);
      await query('delete from channel_connections where store_id=$1', [storeId]);
      await query('delete from contacts where store_id=$1', [storeId]);
      await query('delete from stores where id=$1', [storeId]);
      await query('delete from users where id=$1', [userId]);
    } finally {
      await admin.pool.end();
    }
  });

  it('refuses a resend before 48 hours and for a campaign that has not finished', async () => {
    await expect(
      sources.createDraft(storeId, sentId, 'resend_unread', actor),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_RESEND_TOO_EARLY' });
    await query(
      "insert into campaigns(id,store_id,name,channel,content) values($1,$2,'খসড়া','sms','{}')",
      [draftId, storeId],
    );
    await expect(
      sources.createDraft(storeId, draftId, 'follow_up_unordered', actor),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FINISHED' });
    await expect(
      sources.createDraft(randomUUID(), sentId, 'follow_up_unordered', actor),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
  });

  it('refuses a resend of an SMS campaign, which has no read receipts', async () => {
    await expect(
      sources.createDraft(storeId, smsSentId, 'resend_unread', actor),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_RESEND_NEEDS_READS' });
    expect(
      await sources.createDraft(storeId, smsSentId, 'follow_up_unordered', actor),
    ).toMatchObject({ source: { campaignId: smsSentId, outcome: 'follow_up_unordered' } });
  });

  it('makes a follow-up draft of people who tapped and did not order', async () => {
    const followUp = await sources.createDraft(storeId, sentId, 'follow_up_unordered', actor);
    expect(followUp).toMatchObject({
      name: 'Follow-up to ঈদের অফার',
      status: 'draft',
      includeSegmentIds: [],
      source: { campaignId: sentId, outcome: 'follow_up_unordered' },
      content: { text: 'ঈদে ২০% ছাড়' },
    });
    expect((await firstPage(followUp.id)).ids).toEqual([person.tappedOnly]);
    expect((await firstPage(followUp.id)).page.isLast).toBe(true);
    await expect(
      campaigns.changeDraft(storeId, followUp.id, { includeSegmentIds: [randomUUID()] }, actor),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_AUDIENCE_FIXED' });
  });

  it('makes a resend draft of people who got the message and never read it', async () => {
    await query("update campaigns set finished_at = now() - interval '49 hours' where id=$1", [
      sentId,
    ]);
    const resend = await sources.createDraft(storeId, sentId, 'resend_unread', actor);
    expect(resend).toMatchObject({
      name: 'Resend of ঈদের অফার',
      source: { campaignId: sentId, outcome: 'resend_unread' },
    });
    expect((await firstPage(resend.id)).ids).toEqual([person.unread, person.tappedOrdered].sort());
  });
});
