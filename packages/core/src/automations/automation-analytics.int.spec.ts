import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { AutomationAnalyticsRepository } from './automation-analytics.repository';

describe('automation analytics read', () => {
  const f = new OwnerIsolationFixture();
  const automations = new AutomationAnalyticsRepository(f.tenant);
  const range = { from: '2026-11-10', through: '2026-11-10', timeZone: 'Asia/Dhaka' };
  const query = (sql: string, values: unknown[]) => f.connection.pool.query(sql, values);

  async function automation(store: string, name: string, status: string) {
    const [id, version] = [randomUUID(), randomUUID()];
    await query(
      "insert into automations(id,store_id,name,trigger_type,draft_graph) values($1,$2,$3,'manual','{}')",
      [id, store, name],
    );
    await query(
      'insert into automation_versions(id,store_id,automation_id,version,graph) values($1,$2,$3,1,$4)',
      [version, store, id, '{}'],
    );
    await query(
      "update automations set status=$1, pause_reason=case when $1='paused' then 'manual' end, published_version_id=$2 where id=$3",
      [status, version, id],
    );
    return { id, version };
  }

  async function run(
    store: string,
    flow: { id: string; version: string },
    contact: string,
    enteredAt: string,
    sentAt: string | null,
    channel = 'whatsapp',
  ) {
    const runId = randomUUID();
    await query(
      `insert into automation_runs(id,store_id,automation_id,version_id,contact_id,trigger_key,current_step_key,status,entered_at)
       values($1,$2,$3,$4,$5,$6,'first','done',$7)`,
      [runId, store, flow.id, flow.version, contact, randomUUID(), enteredAt],
    );
    if (sentAt)
      await query(
        `insert into automation_run_steps(id,store_id,run_id,contact_id,step_key,kind,outcome,channel,category,sent_at,cost_poisha)
         values($1,$2,$3,$4,'first','send','sent',$5,'marketing',$6,95)`,
        [randomUUID(), store, runId, contact, channel, sentAt],
      );
  }

  beforeAll(async () => {
    await f.setup();
    const contact = randomUUID();
    const otherContact = randomUUID();
    for (const [id, store] of [
      [contact, f.a],
      [otherContact, f.b],
    ])
      await query(
        "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা','manual','customer')",
        [id, store],
      );
    // 2026-11-09T18:00Z is the first instant of 10 November in Dhaka.
    const welcome = await automation(f.a, 'Welcome', 'active');
    const quiet = await automation(f.a, 'Quiet', 'active');
    await automation(f.a, 'Paused and idle', 'paused');
    const pausedWithEntries = await automation(f.a, 'Paused with entries', 'paused');
    const foreign = await automation(f.b, 'Other store', 'active');
    await run(f.a, welcome, contact, '2026-11-10T06:00:00Z', '2026-11-10T06:01:00Z');
    await run(f.a, welcome, contact, '2026-11-10T07:00:00Z', '2026-11-10T07:01:00Z', 'sms');
    await run(f.a, welcome, contact, '2026-11-09T17:00:00Z', '2026-11-09T17:01:00Z');
    await run(f.a, pausedWithEntries, contact, '2026-11-10T06:00:00Z', null);
    await run(f.b, foreign, otherContact, '2026-11-10T06:00:00Z', '2026-11-10T06:01:00Z');
    expect(quiet.id).toBeTruthy();
  });

  afterAll(async () => {
    await query('delete from automation_run_steps where store_id=any($1::uuid[])', [[f.a, f.b]]);
    await f.close();
  });

  it('lists live automations and paused ones with activity, counting entries and marketing sends', async () => {
    const rows = await automations.inRange(f.a, range);
    expect(rows.map(({ name }) => name)).toEqual(['Paused with entries', 'Quiet', 'Welcome']);
    const welcome = rows.find(({ name }) => name === 'Welcome')!;
    expect(welcome).toMatchObject({ status: 'active', entered: 2, sent: 2, costPoisha: '190' });
    expect(welcome.channels.split(',').sort()).toEqual(['sms', 'whatsapp']);
    expect(rows.find(({ name }) => name === 'Quiet')).toMatchObject({ entered: 0, sent: 0 });
  });
});
