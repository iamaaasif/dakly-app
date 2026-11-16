import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { SendingRepository } from './sending.repository';

const sentAt = new Date('2026-11-16T05:00:00Z');

describe('sending filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new SendingRepository(f.tenant);
  const contactA = randomUUID();
  const contactB = randomUUID();

  // One marketing SMS from a campaign and one from a workflow, for the contact in each store.
  async function seedSends(storeId: string, contactId: string) {
    const [campaignId, automationId, versionId, runId] = [1, 2, 3, 4].map(() => randomUUID());
    const sql = f.connection.pool;
    await sql.query(
      "insert into contacts(id,store_id,name,source,kind) values($1,$2,'রিনা','manual','customer')",
      [contactId, storeId],
    );
    await sql.query(
      `insert into campaigns(id,store_id,name,channel,content,status) values($1,$2,'ঈদ অফার','sms','{}','sending')`,
      [campaignId, storeId],
    );
    await sql.query(
      "insert into campaign_recipients(id,store_id,campaign_id,contact_id,status,sent_at) values($1,$2,$3,$4,'sent',$5)",
      [randomUUID(), storeId, campaignId, contactId, sentAt],
    );
    await sql.query(
      `insert into automations(id,store_id,name,trigger_type,draft_graph) values($1,$2,'স্বাগতম','consent_given','{}')`,
      [automationId, storeId],
    );
    await sql.query(
      "insert into automation_versions(id,store_id,automation_id,version,graph) values($1,$2,$3,1,'{}')",
      [versionId, storeId, automationId],
    );
    await sql.query(
      "insert into automation_runs(id,store_id,automation_id,version_id,contact_id,trigger_key,current_step_key,status) values($1,$2,$3,$4,$5,'k','send','running')",
      [runId, storeId, automationId, versionId, contactId],
    );
    await sql.query(
      "insert into automation_run_steps(id,store_id,run_id,contact_id,step_key,kind,outcome,channel,sent_at) values($1,$2,$3,$4,'send','send','sent','sms',$5)",
      [randomUUID(), storeId, runId, contactId, sentAt],
    );
  }

  beforeAll(async () => {
    await f.setup();
    await seedSends(f.a, contactA);
    await seedSends(f.b, contactB);
  });

  afterAll(async () => {
    for (const table of [
      'campaign_recipients',
      'campaigns',
      'automation_run_steps',
      'automation_runs',
      'automation_versions',
      'automations',
    ])
      await f.connection.pool.query(`delete from ${table} where store_id=any($1::uuid[])`, [
        [f.a, f.b],
      ]);
    await f.close();
  });

  it('lists only the selected store’s sends', async () => {
    const window = [new Date('2026-11-09T06:00:00Z'), new Date('2026-11-16T06:00:00Z')] as const;

    expect(await repository.listMarketingSends(f.a, contactA, ...window)).toEqual([
      { channel: 'sms', sentAt },
      { channel: 'sms', sentAt },
    ]);
    expect(await repository.listMarketingSends(f.b, contactA, ...window)).toEqual([]);
  });
});
