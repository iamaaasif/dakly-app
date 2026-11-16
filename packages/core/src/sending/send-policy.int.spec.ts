import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { campaignRecipients } from '@dakly/db/schema/campaigns';

import { ConsentService } from '../consents/consent.service';
import { DatabaseModule } from '../platform/database/database.module';
import { StoreTransaction } from '../platform/database/store-transaction';
import { TenantDatabase } from '../platform/database/tenant-database';
import { type SendRequest, SendPolicyService } from './send-policy.service';
import { SendingModule } from './sending.module';

class TestModule {}
Module({ imports: [DatabaseModule, SendingModule] })(TestModule);

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeA = randomUUID();
const storeB = randomUUID();
const system = { kind: 'system' } as const;
// 12:00 and 21:30 in Dhaka (UTC+6).
const noon = new Date('2026-11-16T06:00:00Z');
const evening = new Date('2026-11-16T15:30:00Z');
const HOUR = 60 * 60 * 1000;
let app: INestApplicationContext;
let policy: SendPolicyService;
let phone = 0;

function hoursBefore(hours: number) {
  return new Date(noon.getTime() - hours * HOUR);
}

async function consentedContact(storeId: string) {
  const id = randomUUID();
  await admin.pool.query(
    "insert into contacts(id,store_id,name,phone,source,kind) values($1,$2,'সুমি আক্তার',$3,'manual','customer')",
    [id, storeId, `0171${String(++phone).padStart(7, '0')}`],
  );
  await app
    .get(ConsentService)
    .record(
      storeId,
      { contactId: id, channel: 'sms', status: 'granted', source: 'checkout', evidence: null },
      system,
    );
  return id;
}

async function campaign(storeId: string, category = 'marketing') {
  const campaignId = randomUUID();
  await admin.pool.query(
    "insert into campaigns(id,store_id,name,channel,category,content,status) values($1,$2,'পূজার ছাড়','sms',$3,'{}','sending')",
    [campaignId, storeId, category],
  );
  return campaignId;
}

async function campaignSend(
  storeId: string,
  contactId: string,
  sentAt: Date | null,
  { status = 'sent', category = 'marketing' } = {},
) {
  const campaignId = await campaign(storeId, category);
  await admin.pool.query(
    'insert into campaign_recipients(id,store_id,campaign_id,contact_id,status,sent_at) values($1,$2,$3,$4,$5,$6)',
    [randomUUID(), storeId, campaignId, contactId, status, sentAt],
  );
}

async function workflowSend(
  storeId: string,
  contactId: string,
  sentAt: Date,
  { channel = 'sms', isTransactional = false } = {},
) {
  const [automationId, versionId, runId] = [randomUUID(), randomUUID(), randomUUID()];
  await admin.pool.query(
    "insert into automations(id,store_id,name,trigger_type,draft_graph,is_transactional) values($1,$2,'ফিরে আসুন','consent_given','{}',$3)",
    [automationId, storeId, isTransactional],
  );
  await admin.pool.query(
    "insert into automation_versions(id,store_id,automation_id,version,graph) values($1,$2,$3,1,'{}')",
    [versionId, storeId, automationId],
  );
  await admin.pool.query(
    "insert into automation_runs(id,store_id,automation_id,version_id,contact_id,trigger_key,current_step_key,status) values($1,$2,$3,$4,$5,'k','send','done')",
    [runId, storeId, automationId, versionId, contactId],
  );
  await admin.pool.query(
    "insert into automation_run_steps(id,store_id,run_id,contact_id,step_key,kind,outcome,channel,sent_at) values($1,$2,$3,$4,'send','send','sent',$5,$6)",
    [randomUUID(), storeId, runId, contactId, channel, sentAt],
  );
}

// The sending job runs the gate inside its store transaction.
function check(storeId: string, contactId: string, change: Partial<SendRequest> = {}) {
  return app.get(StoreTransaction).run(storeId, () =>
    policy.check(storeId, {
      contactId,
      channel: 'sms',
      category: 'marketing',
      at: noon,
      ...change,
    }),
  );
}

async function waitForBlockedAdvisoryLock() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const waiting = await admin.pool.query(
      "select 1 from pg_locks where locktype='advisory' and not granted and database=(select oid from pg_database where datname=current_database())",
    );
    if (waiting.rowCount) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('The second check never waited for the contact lock');
}

describe('SendPolicyService (Postgres)', () => {
  beforeAll(async () => {
    await admin.pool.query(
      "insert into stores(id,name) values($1,'রিনার দোকান'),($2,'করিমের দোকান')",
      [storeA, storeB],
    );
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    policy = app.get(SendPolicyService);
  });

  afterAll(async () => {
    try {
      await app?.close();
      for (const table of [
        'campaign_recipients',
        'campaigns',
        'automation_run_steps',
        'automation_runs',
        'automation_versions',
        'automations',
        'outbox_events',
        'contacts',
      ])
        await admin.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
          [storeA, storeB],
        ]);
      await admin.pool.query('delete from stores where id=any($1::uuid[])', [[storeA, storeB]]);
    } finally {
      await admin.pool.end();
    }
  });

  it('counts campaign and workflow sends together toward 3 in 7 days', async () => {
    const contactId = await consentedContact(storeA);
    await campaignSend(storeA, contactId, hoursBefore(30));
    await workflowSend(storeA, contactId, hoursBefore(50), { channel: 'whatsapp' });
    expect(await check(storeA, contactId)).toEqual({ action: 'send' });

    await workflowSend(storeA, contactId, hoursBefore(70), { channel: 'messenger' });

    expect(await check(storeA, contactId)).toEqual({ action: 'skip', reason: 'frequency_cap' });
  });

  it.each([
    ['campaign', campaignSend],
    ['workflow', workflowSend],
  ])('counts a %s SMS in the last 24 hours toward the daily SMS cap', async (_source, send) => {
    const contactId = await consentedContact(storeA);
    await send(storeA, contactId, hoursBefore(2));

    expect(await check(storeA, contactId)).toEqual({ action: 'skip', reason: 'frequency_cap' });
  });

  it('does not count unsent, transactional, old or later messages', async () => {
    const contactId = await consentedContact(storeA);
    await campaignSend(storeA, contactId, hoursBefore(1), { status: 'failed' });
    await campaignSend(storeA, contactId, hoursBefore(1), { category: 'utility' });
    await workflowSend(storeA, contactId, hoursBefore(1), { isTransactional: true });
    await campaignSend(storeA, contactId, hoursBefore(8 * 24));
    await workflowSend(storeA, contactId, hoursBefore(-1));

    expect(await check(storeA, contactId)).toEqual({ action: 'send' });
  });

  it('skips a contact who withdrew after approval', async () => {
    const contactId = await consentedContact(storeA);
    expect(await check(storeA, contactId)).toEqual({ action: 'send' });

    await app
      .get(ConsentService)
      .record(
        storeA,
        { contactId, channel: 'sms', status: 'withdrawn', source: 'opt_out_link', evidence: null },
        system,
      );

    expect(await check(storeA, contactId)).toEqual({ action: 'skip', reason: 'no_consent' });
  });

  it('sends transactional SMS in quiet hours to a contact over the cap', async () => {
    const contactId = await consentedContact(storeA);
    await campaignSend(storeA, contactId, hoursBefore(1));
    const at = evening;

    expect(await check(storeA, contactId, { at })).toEqual({
      action: 'defer',
      until: new Date('2026-11-17T03:00:00Z'),
    });
    expect(await check(storeA, contactId, { at, category: 'transactional' })).toEqual({
      action: 'send',
    });
  });

  it('follows the quiet hours and cap the store saved', async () => {
    await admin.pool.query(
      `update stores set settings='{"sending":{"quietHours":{"startHour":22,"endHour":8},"frequencyCap":{"perChannelPerDay":2,"perSevenDays":5}}}' where id=$1`,
      [storeB],
    );
    const contactId = await consentedContact(storeB);
    await campaignSend(storeB, contactId, new Date(evening.getTime() - HOUR));

    expect(await check(storeB, contactId, { at: evening })).toEqual({ action: 'send' });
    expect(await check(storeB, contactId, { at: new Date('2026-11-16T16:00:00Z') })).toEqual({
      action: 'defer',
      until: new Date('2026-11-17T02:00:00Z'),
    });
  });

  it('counts a recipient still in sending as a send now', async () => {
    const contactId = await consentedContact(storeA);
    await campaignSend(storeA, contactId, null, { status: 'sending' });

    expect(await check(storeA, contactId)).toEqual({ action: 'skip', reason: 'frequency_cap' });
  });

  it('lets only one of two concurrent checks for one contact send', async () => {
    const contactId = await consentedContact(storeA);
    const campaignId = await campaign(storeA);
    let firstDecided!: () => void;
    let firstMayCommit!: () => void;
    const decided = new Promise<void>((resolve) => (firstDecided = resolve));
    const mayCommit = new Promise<void>((resolve) => (firstMayCommit = resolve));
    // As the sending job does: decide, then mark the recipient sending in the same transaction.
    const first = app.get(StoreTransaction).run(storeA, async () => {
      const decision = await check(storeA, contactId);
      firstDecided();
      await mayCommit;
      await app.get(TenantDatabase).forStore(storeA, (tx) =>
        tx.insert(campaignRecipients).values({
          id: randomUUID(),
          storeId: storeA,
          campaignId,
          contactId,
          status: 'sending',
        }),
      );
      return decision;
    });
    await decided;
    const second = check(storeA, contactId);
    await waitForBlockedAdvisoryLock();
    firstMayCommit();

    expect(await first).toEqual({ action: 'send' });
    expect(await second).toEqual({ action: 'skip', reason: 'frequency_cap' });
  });
});
