import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import { createDatabase } from '@dakly/db/client';

import { ContactsModule } from '../contacts/contacts.module';
import { ContactsService } from '../contacts/contacts.service';
import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { QUEUES } from '../platform/queue/queues';
import { DAY_MS } from '../platform/time';
import { AutomationEntryRepository } from './automation-entry.repository';
import { AutomationEntryService } from './automation-entry.service';
import { StartAutomationOnTagAdded } from './jobs/start-automation-on-tag-added.job';
import { StartAutomationRunJob } from './jobs/start-automation-run.job';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const contactId = randomUUID();
const otherStoreId = randomUUID();
const otherContactId = randomUUID();
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
  const queued: { data: unknown }[] = [];
  const start = (automationId: string, id = randomUUID(), source: 'manual' | 'import' = 'manual') =>
    entries.start(automationId, {
      id,
      storeId,
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
      imports: [DatabaseModule, ContactsModule],
      providers: [
        AutomationEntryService,
        AutomationEntryRepository,
        { provide: Clock, useValue: { now: () => now } },
        {
          provide: getQueueToken(QUEUES.workflow),
          useValue: { addBulk: async (jobs: { data: unknown }[]) => queued.push(...jobs) },
        },
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
    await admin.pool.query("update automations set status='paused' where id=$1", [id]);
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
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await contacts.changeTag(storeId, contactId, { tag, change: 'add' }, { kind: 'system' });
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
    for (const { data } of queued.splice(0)) await new StartAutomationRunJob(entries).handle(data);
    expect(await runs(id)).toHaveLength(1);
    expect(await runs(other)).toEqual([]);
  });

  it('refuses to start a workflow belonging to another store', async () => {
    const id = await workflow();
    const eventId = randomUUID();
    await entries.start(id, {
      id: eventId,
      storeId: otherStoreId,
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
});
