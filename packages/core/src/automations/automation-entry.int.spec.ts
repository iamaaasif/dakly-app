import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AutomationGraph } from '@dakly/contracts/automations/graph';
import { createDatabase } from '@dakly/db/client';

import { ContactsModule } from '../contacts/contacts.module';
import { Clock } from '../platform/clock';
import { DatabaseModule } from '../platform/database/database.module';
import { QUEUES } from '../platform/queue/queues';
import { DAY_MS } from '../platform/time';
import { AutomationEntryRepository } from './automation-entry.repository';
import { AutomationEntryService } from './automation-entry.service';

const admin = createDatabase(process.env.DATABASE_ADMIN_URL!);
const storeId = randomUUID();
const contactId = randomUUID();
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

async function workflow(reEntry = graph.reEntry) {
  const id = randomUUID();
  const version = randomUUID();
  const input = { ...graph, reEntry };
  await admin.pool.query(
    "insert into automations(id,store_id,name,trigger_type,status,draft_graph) values($1,$2,'স্বাগতম','consent_given','active',$3)",
    [id, storeId, input],
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
    await admin.pool.query("insert into stores(id,name) values($1,'রিনার দোকান')", [storeId]);
    await admin.pool.query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা আক্তার','manual','customer')",
      [contactId, storeId],
    );
    class TestModule {}
    Module({
      imports: [DatabaseModule, ContactsModule],
      providers: [
        AutomationEntryService,
        AutomationEntryRepository,
        { provide: Clock, useValue: { now: () => now } },
        { provide: getQueueToken(QUEUES.workflow), useValue: {} },
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
      for (const table of ['automation_versions', 'automations', 'contacts', 'stores'])
        await admin.pool.query(
          `delete from ${table} where ${table === 'stores' ? 'id' : 'store_id'}=$1`,
          [storeId],
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
});
