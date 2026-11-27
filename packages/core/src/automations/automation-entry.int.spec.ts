import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import type { ChatIntent } from '@dakly/contracts/chats';
import { createDatabase } from '@dakly/db/client';

import { CommentPostProductsService } from '../comments/comment-post-products.service';
import { CommentsService } from '../comments/comments.service';
import { ContactsModule } from '../contacts/contacts.module';
import { ContactsService } from '../contacts/contacts.service';
import { ConversationIntentService } from '../messaging/conversation-intent.service';
import { OrdersModule } from '../orders/orders.module';
import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { DAY_MS } from '../platform/time';
import { SegmentsModule } from '../segments/segments.module';
import { AutomationEntryRepository } from './automation-entry.repository';
import { AutomationEntryService } from './automation-entry.service';
import { StartAutomationOnBirthday } from './jobs/start-automation-on-birthday.job';
import { StartAutomationOnTagAdded } from './jobs/start-automation-on-tag-added.job';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const contactId = randomUUID();
const otherStoreId = randomUUID();
const otherContactId = randomUUID();
// What the customer wrote in the burst; the real lookup is checked in the AI agent spec.
let spoken = '';
const conversationId = randomUUID();
const firstDay = new Date('2026-11-19T10:00:00.000Z');
const graph: AutomationGraph = {
  trigger: { key: 'consent_given', filters: [{ field: 'channel', channels: ['sms'] }] },
  reEntry: { rule: 'every_days', days: 30 },
  workflowFilters: [],
  goal: null,
  exitConditions: [],
  firstStepKey: 'end',
  steps: { end: { kind: 'exit' } },
};

async function workflow(reEntry = graph.reEntry, trigger = graph.trigger) {
  const id = randomUUID();
  const version = randomUUID();
  const input = { ...graph, reEntry, trigger };
  await admin.pool.query(
    "insert into automations(id,store_id,name,trigger_type,status,draft_graph) values($1,$2,'স্বাগতম',$4,'active',$3)",
    [id, storeId, input, trigger.key],
  );
  await admin.pool.query(
    'insert into automation_versions(id,store_id,automation_id,version,graph,published_at) values($1,$2,$3,1,$4,$5)',
    [version, storeId, id, input, firstDay],
  );
  await admin.pool.query('update automations set published_version_id=$2 where id=$1', [
    id,
    version,
  ]);
  return id;
}

describe('AutomationEntryService (Postgres)', () => {
  let app: INestApplicationContext;
  let entries: AutomationEntryService;
  let now = firstDay;
  const start = (automationId: string, id = randomUUID(), source: 'manual' | 'import' = 'manual') =>
    entries.start(storeId, automationId, {
      id,
      type: 'consent.changed',
      occurredAt: now.toISOString(),
      payload: { consentId: id, contactId, channel: 'sms', status: 'granted', source },
    });
  const runs = async (id: string) =>
    (await admin.pool.query('select trigger_key from automation_runs where automation_id=$1', [id]))
      .rows;

  beforeAll(async () => {
    await admin.pool.query(
      "insert into stores(id,name) values($1,'রিনার দোকান'),($2,'করিমের দোকান')",
      [storeId, otherStoreId],
    );
    await admin.pool.query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা আক্তার','manual','customer'),($3,$4,'করিম মিয়া','manual','customer')",
      [contactId, storeId, otherContactId, otherStoreId],
    );
    class TestModule {}
    Module({
      imports: [DatabaseModule, ContactsModule, OrdersModule, SegmentsModule],
      providers: [
        AutomationEntryService,
        AutomationEntryRepository,
        { provide: Clock, useValue: { now: () => now } },
        { provide: ConversationIntentService, useValue: { burstText: async () => spoken } },
        { provide: CommentsService, useValue: {} },
        { provide: CommentPostProductsService, useValue: {} },
      ],
    })(TestModule);
    app = await NestFactory.createApplicationContext(TestModule, { logger: false });
    entries = app.get(AutomationEntryService);
  });

  afterAll(async () => {
    try {
      await app?.close();
      await admin.pool.query('delete from automation_runs where store_id=$1', [storeId]);
      await admin.pool.query('update automations set published_version_id=null where store_id=$1', [
        storeId,
      ]);
      await admin.pool.query('delete from outbox_events where store_id=$1', [storeId]);
      for (const table of ['automation_versions', 'automations', 'contacts', 'stores'])
        await admin.pool.query(
          `delete from ${table} where ${table === 'stores' ? 'id' : 'store_id'}=any($1::uuid[])`,
          [[storeId, otherStoreId]],
        );
    } finally {
      await admin.pool.end();
    }
  });

  it('starts one run when the same event is delivered twice', async () => {
    const id = await workflow({ rule: 'every_time' });
    const eventId = randomUUID();
    await start(id, eventId);
    await admin.pool.query("update automation_runs set status='done' where automation_id=$1", [id]);
    await start(id, eventId);
    expect(await runs(id)).toHaveLength(1);
  });

  it('keeps only one active run when different events arrive together', async () => {
    const id = await workflow({ rule: 'every_time' });
    await Promise.all([start(id), start(id)]);
    expect(await runs(id)).toHaveLength(1);
  });

  it('refuses day 29 and lets the contact back in on day 30', async () => {
    const id = await workflow();
    try {
      await start(id);
      await admin.pool.query("update automation_runs set status='done' where automation_id=$1", [
        id,
      ]);
      now = new Date(firstDay.getTime() + 29 * DAY_MS);
      await start(id);
      expect(await runs(id)).toHaveLength(1);
      now = new Date(firstDay.getTime() + 30 * DAY_MS);
      await start(id);
      expect(await runs(id)).toHaveLength(2);
    } finally {
      now = firstDay;
    }
  });

  it('starts nothing for a disabled workflow', async () => {
    const id = await workflow();
    await admin.pool.query(
      "update automations set status='paused', pause_reason='manual' where id=$1",
      [id],
    );
    await start(id);
    expect(await runs(id)).toEqual([]);
  });

  it('starts nothing for consent granted by an import', async () => {
    const id = await workflow();
    await start(id, randomUUID(), 'import');
    expect(await runs(id)).toEqual([]);
  });

  it('starts a matching workflow only when the contact gains the tag', async () => {
    const tag = 'ভিআইপি';
    const id = await workflow(
      { rule: 'every_time' },
      { key: 'tag_added', filters: [{ field: 'tag', tag }] },
    );
    const other = await workflow(
      { rule: 'every_time' },
      { key: 'tag_added', filters: [{ field: 'tag', tag: 'নিয়মিত' }] },
    );
    const contacts = app.get(ContactsService);
    const contactClock = vi.spyOn(Clock.prototype, 'now').mockReturnValue(now);
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await contacts.changeTag(storeId, contactId, { tag, change: 'add' }, { kind: 'system' });
      }
    } finally {
      contactClock.mockRestore();
    }
    const { rows } = await admin.pool.query(
      `select id, type, store_id as "storeId", payload, occurred_at as "occurredAt"
       from outbox_events where store_id=$1 and type='contact.tag_added'`,
      [storeId],
    );
    expect(rows).toHaveLength(1);
    const [event] = rows;
    await new StartAutomationOnTagAdded(entries).handle({
      ...event,
      occurredAt: event.occurredAt.toISOString(),
    });
    expect(await runs(id)).toHaveLength(1);
    expect(await runs(other)).toEqual([]);
  });

  it('refuses to start a workflow belonging to another store', async () => {
    const id = await workflow();
    const eventId = randomUUID();
    await entries.start(otherStoreId, id, {
      id: eventId,
      type: 'consent.changed',
      occurredAt: now.toISOString(),
      payload: {
        consentId: eventId,
        contactId: otherContactId,
        channel: 'sms',
        status: 'granted',
        source: 'manual',
      },
    });
    expect(await runs(id)).toEqual([]);
  });

  it('starts the birthday workflow for a matching contact', async () => {
    const id = await workflow({ rule: 'every_time' }, { key: 'birthday', filters: [] });
    const excluded = await workflow(
      { rule: 'every_time' },
      {
        key: 'birthday',
        filters: [{ field: 'segment', segmentId: randomUUID() }],
      },
    );
    await new StartAutomationOnBirthday(entries).handle({
      id: randomUUID(),
      storeId,
      type: 'contact.birthday',
      occurredAt: now.toISOString(),
      payload: { contactId, day: now.toISOString().slice(0, 10) },
    });
    expect(await runs(id)).toHaveLength(1);
    expect(await runs(excluded)).toEqual([]);
  });
  describe('message_received', () => {
    const messageGraph = (filters: AutomationGraph['trigger']['filters']) =>
      workflow({ rule: 'every_time' }, { key: 'message_received', filters });
    // A finished run lets the next message start another, so each message is judged alone.
    const receive = async (
      text: string,
      intent: ChatIntent | null,
      channel: 'messenger' | 'instagram' | 'whatsapp',
      newestMessageId = randomUUID(),
    ) => {
      spoken = text;
      await entries.startMatchingMessage(storeId, {
        id: randomUUID(),
        type: 'message.burst_received',
        occurredAt: now.toISOString(),
        payload: { conversationId, contactId, channel, intent, messageIds: [newestMessageId] },
      });
      await admin.pool.query("update automation_runs set status='done' where store_id=$1", [
        storeId,
      ]);
    };
    const runCount = async (id: string) => (await runs(id)).length;

    it('starts on a price question in Bangla, Banglish or mixed text and skips the rest', async () => {
      const id = await messageGraph([
        { field: 'intent', intents: ['price'] },
        { field: 'keywords', keywords: ['দাম', 'dam', 'price'] },
      ]);
      now = new Date(firstDay.getTime() + 60 * DAY_MS);
      await receive('এই শার্টের দাম কত?', 'price', 'messenger');
      await receive('dam koto bhai', 'price', 'messenger');
      await receive('এটার price কত, delivery koto?', 'price', 'instagram');
      expect(await runCount(id)).toBe(3);
      await receive('দাম কত?', 'delivery', 'messenger');
      await receive('Adam bhai ache?', 'price', 'messenger');
      await receive('😍😍', 'price', 'messenger');
      expect(await runCount(id)).toBe(3);
    });

    it('matches Bangla digits in keywords and only the listed channels', async () => {
      const id = await messageGraph([
        { field: 'channel', channels: ['instagram'] },
        { field: 'keywords', keywords: ['size 12'] },
      ]);
      now = new Date(firstDay.getTime() + 61 * DAY_MS);
      await receive('size ১২ আছে?', 'size_or_stock', 'messenger');
      expect(await runCount(id)).toBe(0);
      await receive('size ১২ আছে?', 'size_or_stock', 'instagram');
      expect(await runCount(id)).toBe(1);
    });

    it('matches keywords and channel on a burst nobody classified, but never an intent', async () => {
      const byIntent = await messageGraph([{ field: 'intent', intents: ['price'] }]);
      const byWords = await messageGraph([
        { field: 'channel', channels: ['whatsapp'] },
        { field: 'keywords', keywords: ['দাম', 'dam'] },
      ]);
      now = new Date(firstDay.getTime() + 63 * DAY_MS);
      await receive('dam koto', null, 'whatsapp');
      await receive('এটার দামটা কত', null, 'whatsapp');
      await receive('dam koto', null, 'messenger');
      expect(await runCount(byIntent)).toBe(0);
      expect(await runCount(byWords)).toBe(2);
    });

    it('starts one run when a retried reply announces the same burst again', async () => {
      const id = await messageGraph([]);
      now = new Date(firstDay.getTime() + 64 * DAY_MS);
      const newest = randomUUID();
      await receive('hi', null, 'messenger', newest);
      await receive('hi', 'greeting', 'messenger', newest);
      expect(await runCount(id)).toBe(1);
    });

    it('starts on any message when no filter is set', async () => {
      const id = await messageGraph([]);
      now = new Date(firstDay.getTime() + 62 * DAY_MS);
      await receive('hi', 'greeting', 'messenger');
      expect(await runCount(id)).toBe(1);
    });
  });
});
