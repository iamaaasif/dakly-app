import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCampaignSchema } from '@dakly/contracts/campaigns';
import type { StoreAccess } from '@dakly/contracts/team';
import { createDatabase } from '@dakly/db/client';
import { MetaRequestError } from '@dakly/providers/channel/channel-driver';
import { FakeMetaChannelDriver } from '@dakly/providers/channel/meta/fake-meta-channel-driver';

import { runApprovalJob } from '../../test/approve-campaign';
import { Clock } from '../platform/clock';
import { loadEnv, resetEnvForTests } from '../platform/config/env';
import { EnvelopeEncryption } from '../platform/crypto/envelope-encryption';
import { DatabaseModule } from '../platform/database/database.module';
import { toRedisConnection } from '../platform/queue/redis-connection';
import { SegmentsService } from '../segments/segments.service';
import { CampaignApprovalService } from './campaign-approval.service';
import { CampaignSenderService } from './campaign-sender.service';
import { CampaignsModule } from './campaigns.module';
import { CampaignsService } from './campaigns.service';

class TestModule {}
Module({
  imports: [
    DatabaseModule,
    CampaignsModule.forWorker(),
    BullModule.forRoot({
      connection: toRedisConnection(loadEnv().REDIS_URL),
      prefix: `${loadEnv().QUEUE_PREFIX}-campaign-messenger-${randomUUID()}`,
    }),
  ],
})(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const userId = randomUUID();
const actor = { kind: 'user', userId } as const;
const owner: { access: StoreAccess; actor: typeof actor } = {
  access: {
    role: 'owner',
    areas: { campaigns: 'edit' },
    seeFullPhone: false,
    exportLists: false,
    refund: false,
  },
  actor,
};
const HOUR = 60 * 60 * 1000;
// Tomorrow at 12:00 in Dhaka (UTC+6): outside quiet hours, and ahead of the database clock that
// bounds a claim.
const today = new Date();
const noon = new Date(
  Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 6),
);
const pages = { first: randomUUID(), second: randomUUID() };
const district = `জেলা-${randomUUID()}`;
let app: INestApplicationContext;
let campaigns: CampaignsService;
let sender: CampaignSenderService;
let segmentId: string;

async function connect(id: string) {
  const secret = app
    .get(EnvelopeEncryption)
    .encrypt(
      { owner: 'store', storeId, purpose: 'channel-access-token' },
      Buffer.from('fixture-page-credential'),
    );
  await admin.pool.query(
    `insert into channel_connections(id,store_id,kind,external_account_id,display_name,connected_at,
      access_token_ciphertext,key_version)
     values($1::uuid,$2,'facebook_page',$1::text,'পেজ', now() - interval '30 days',$3,$4)`,
    [id, storeId, secret.ciphertext, secret.keyVersion],
  );
}

// A new consented contact who wrote to `pageId` `hoursAgo` hours ago under the id `psid`.
async function shopper(psid: string, pageId: string, hoursAgo: number, contactId = randomUUID()) {
  const known = await admin.pool.query('select 1 from contacts where id = $1', [contactId]);
  if (!known.rowCount) {
    await admin.pool.query(
      "insert into contacts(id,store_id,name,source,kind,district) values($1,$2,'রাশেদ','messenger','customer',$3)",
      [contactId, storeId, district],
    );
    await admin.pool.query(
      "insert into consents(id,store_id,contact_id,channel,status,source) values(gen_random_uuid(),$1,$2,'messenger','granted','checkout')",
      [storeId, contactId],
    );
  }
  await admin.pool.query(
    "insert into contact_identities(id,store_id,contact_id,channel_connection_id,channel,external_id) values(gen_random_uuid(),$1,$2,$3,'messenger',$4)",
    [storeId, contactId, pageId, psid],
  );
  await admin.pool.query(
    "insert into conversations(id,store_id,contact_id,channel_connection_id,channel,last_inbound_at) values(gen_random_uuid(),$1,$2,$3,'messenger',$4)",
    [storeId, contactId, pageId, new Date(noon.getTime() - hoursAgo * HOUR)],
  );
  return contactId;
}

async function sendingCampaign(pageId: string) {
  const { id } = await campaigns.create(
    storeId,
    createCampaignSchema.parse({
      name: 'মেসেঞ্জার অফার',
      channel: 'messenger',
      channelConnectionId: pageId,
      content: {
        text: 'আজ ১০% ছাড়',
        imageUrl: 'https://cdn.example.test/offer.jpg',
        buttons: [{ title: 'দেখুন' }],
      },
      includeSegmentIds: [segmentId],
    }),
    actor,
  );
  await campaigns.approve(storeId, id, owner);
  await runApprovalJob(app.get(CampaignApprovalService), admin.pool, storeId, id);
  return id;
}

async function recipients(campaignId: string) {
  const { rows } = await admin.pool.query(
    `select r.status, r.skip_reason, r.error_code, r.sms_credits, i.external_id from campaign_recipients r
     left join contact_identities i on i.id = r.contact_identity_id
     where r.campaign_id = $1 order by i.external_id`,
    [campaignId],
  );
  return rows as {
    status: string;
    skip_reason: string | null;
    error_code: string | null;
    sms_credits: number | null;
    external_id: string | null;
  }[];
}

async function reset() {
  await admin.pool.query('delete from campaigns where store_id=$1', [storeId]);
  await admin.pool.query('delete from messages where store_id=$1', [storeId]);
  await admin.pool.query('delete from conversations where store_id=$1', [storeId]);
  await admin.pool.query('delete from contact_identities where store_id=$1', [storeId]);
  await admin.pool.query('delete from contacts where store_id=$1', [storeId]);
}

describe('Messenger campaign sends (Postgres)', () => {
  beforeAll(async () => {
    vi.stubEnv('META_CHANNEL_DRIVER', 'fake');
    vi.stubEnv('META_OAUTH_REDIRECT_URI', 'http://localhost:3000/integrations/meta');
    resetEnvForTests();
    await admin.pool.query("insert into stores(id,name) values($1,'রিনার দোকান')", [storeId]);
    await admin.pool.query(
      "insert into users(id,name,email) values($1::uuid,'রিনা',$1::text || '@example.test')",
      [userId],
    );
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    campaigns = app.get(CampaignsService);
    sender = app.get(CampaignSenderService);
    await connect(pages.first);
    await connect(pages.second);
    const rules = {
      match: 'all',
      conditions: [{ field: 'district', operator: 'is_any_of', values: [district] }],
    } as const;
    segmentId = (await app.get(SegmentsService).create(storeId, { name: district, rules }, actor))
      .id;
  });

  beforeEach(() => {
    vi.spyOn(app.get(Clock), 'now').mockReturnValue(noon);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await reset();
  });

  afterAll(async () => {
    try {
      await app?.close();
      await reset();
      await admin.pool.query('delete from segments where store_id=$1', [storeId]);
      await admin.pool.query('delete from channel_connections where store_id=$1', [storeId]);
      await admin.pool.query('delete from stores where id=$1', [storeId]);
    } finally {
      vi.unstubAllEnvs();
      resetEnvForTests();
      await admin.pool.end();
    }
  });

  it('sends the text, image and buttons to the identity on the selected Page for free', async () => {
    const both = await shopper('psid-both-first', pages.first, 30);
    await shopper('psid-both-second', pages.second, 1, both);
    await shopper('psid-open', pages.second, 2);
    const provider = vi
      .spyOn(FakeMetaChannelDriver.prototype, 'send')
      .mockImplementation(async (_, message) => ({
        externalMessageId: `fake-${message.operationKey}`,
      }));
    const id = await sendingCampaign(pages.second);

    expect(await sender.sendBatch(storeId, id)).toBeNull();

    expect(provider).toHaveBeenCalledTimes(2);
    expect(provider.mock.calls.map(([, message]) => message.externalConversationId).sort()).toEqual(
      ['psid-both-second', 'psid-open'],
    );
    expect(provider.mock.calls[0]![1]).toMatchObject({
      channel: 'messenger',
      text: 'আজ ১০% ছাড়',
      imageUrl: 'https://cdn.example.test/offer.jpg',
      buttons: [{ title: 'দেখুন', payload: expect.stringMatching(/^campaign:[0-9a-f-]{36}:0$/) }],
    });
    expect(await recipients(id)).toEqual([
      expect.objectContaining({ status: 'sent', sms_credits: null }),
      expect.objectContaining({ status: 'sent', sms_credits: null }),
    ]);
  });

  it('skips a contact whose window closed after approval', async () => {
    await shopper('psid-open', pages.first, 2);
    await shopper('psid-closing', pages.first, 22.5);
    const provider = vi
      .spyOn(FakeMetaChannelDriver.prototype, 'send')
      .mockResolvedValue({ externalMessageId: 'fake-1' });
    const id = await sendingCampaign(pages.first);
    await admin.pool.query(
      "update conversations set last_inbound_at = $2 where store_id = $1 and contact_id = (select contact_id from contact_identities where external_id = 'psid-closing')",
      [storeId, new Date(noon.getTime() - 25 * HOUR)],
    );

    await sender.sendBatch(storeId, id);

    expect(provider).toHaveBeenCalledOnce();
    expect(await recipients(id)).toEqual([
      expect.objectContaining({
        external_id: 'psid-closing',
        status: 'skipped',
        skip_reason: 'window_closed',
      }),
      expect.objectContaining({ external_id: 'psid-open', status: 'sent' }),
    ]);
  });

  it('sends the text and notes it when Meta refuses the image', async () => {
    await shopper('psid-open', pages.first, 2);
    vi.spyOn(FakeMetaChannelDriver.prototype, 'send').mockResolvedValue({
      externalMessageId: 'fake-1',
      imageRejected: true,
    });
    const id = await sendingCampaign(pages.first);

    await sender.sendBatch(storeId, id);

    expect(await recipients(id)).toEqual([
      expect.objectContaining({ status: 'sent', error_code: 'image_rejected' }),
    ]);
  });

  it('never sends again when the outcome of a send is not known', async () => {
    await shopper('psid-open', pages.first, 2);
    const provider = vi
      .spyOn(FakeMetaChannelDriver.prototype, 'send')
      .mockRejectedValue(new MetaRequestError('unavailable'));
    const id = await sendingCampaign(pages.first);

    await sender.sendBatch(storeId, id);
    await sender.sendBatch(storeId, id);

    expect(provider).toHaveBeenCalledOnce();
    expect(await recipients(id)).toEqual([
      expect.objectContaining({ status: 'failed', error_code: 'outcome_unknown' }),
    ]);
  });

  it('fails the recipient with the provider reason when Meta rejects the send', async () => {
    await shopper('psid-open', pages.first, 2);
    vi.spyOn(FakeMetaChannelDriver.prototype, 'send').mockRejectedValue(
      new MetaRequestError('rejected'),
    );
    const id = await sendingCampaign(pages.first);

    await sender.sendBatch(storeId, id);

    expect(await recipients(id)).toEqual([
      expect.objectContaining({ status: 'failed', error_code: 'rejected' }),
    ]);
  });
});
