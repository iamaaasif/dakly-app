import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { TenantDatabase } from '../platform/database/tenant-database';
import { AutomationRunsRepository } from './automation-runs.repository';

describe('automation step purge (Postgres)', () => {
  const fixture = new OwnerIsolationFixture();
  const owner = fixture.connection.pool;
  // The app role is what runs in production, so row level security and grants apply.
  const app = createDatabase(process.env.DATABASE_URL!);
  const repository = new AutomationRunsRepository(new TenantDatabase(app.db), app.db);
  const contactId = randomUUID();
  const automationId = randomUUID();
  const versionId = randomUUID();
  const count = async () =>
    (
      await owner.query(
        'select count(*)::int as total from automation_run_steps where store_id = $1',
        [fixture.a],
      )
    ).rows[0].total as number;

  async function addRun(finishedDaysAgo: number | null) {
    const runId = randomUUID();
    await owner.query(
      `insert into automation_runs (id, store_id, automation_id, version_id, contact_id, trigger_key, current_step_key, status, finished_at)
       values ($1, $2, $3, $4, $5, $6, 'send', 'done',
         case when $7::int is null then null else now() - make_interval(days => $7::int) end)`,
      [runId, fixture.a, automationId, versionId, contactId, randomUUID(), finishedDaysAgo],
    );
    await owner.query(
      `insert into automation_run_steps (id, store_id, run_id, contact_id, step_key, kind, outcome)
       values ($1, $2, $3, $4, 'send', 'send', 'sent')`,
      [randomUUID(), fixture.a, runId, contactId],
    );
  }

  beforeAll(async () => {
    await fixture.setup();
    await owner.query(
      "insert into contacts (id, store_id, source, kind) values ($1, $2, 'manual', 'customer')",
      [contactId, fixture.a],
    );
    await owner.query(
      "insert into automations (id, store_id, name, trigger_type, draft_graph) values ($1, $2, 'স্বাগত', 'tag_added', '{}')",
      [automationId, fixture.a],
    );
    await owner.query(
      "insert into automation_versions (id, store_id, automation_id, version, graph) values ($1, $2, $3, 1, '{}')",
      [versionId, fixture.a, automationId],
    );
    await addRun(400);
    await addRun(100);
    await addRun(null);
  });
  afterAll(async () => {
    await owner.query('delete from automation_run_steps where store_id = $1', [fixture.a]);
    await owner.query('delete from automation_runs where store_id = $1', [fixture.a]);
    await owner.query('delete from automation_versions where store_id = $1', [fixture.a]);
    await owner.query('delete from contacts where store_id = $1', [fixture.a]);
    await Promise.all([fixture.close(), app.pool.end()]);
  });

  it('deletes steps 372 days after their run finished and keeps the rest', async () => {
    expect(await repository.purgeExpiredStepsBatch(fixture.a, 1)).toBe(true);
    expect(await count()).toBe(2);
    expect(await repository.purgeExpiredStepsBatch(fixture.a, 5)).toBe(false);
    expect(await count()).toBe(2);
  });
});
