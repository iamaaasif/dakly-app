import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { Clock } from '../platform/clock';
import { TenantDatabase } from '../platform/database/tenant-database';
import type { StoresService } from '../stores/stores.service';
import { MaintenanceRollupsRepository } from './maintenance-rollups.repository';
import { MaintenanceRollupsService } from './maintenance-rollups.service';

const ROLLUPS = ['tracked_link_visit_days', 'ai_run_daily_metrics'];

describe('maintenance rollups (Postgres)', () => {
  const fixture = new OwnerIsolationFixture();
  const app = createDatabase(process.env.DATABASE_URL!);
  const repository = new MaintenanceRollupsRepository(app.db, new TenantDatabase(app.db));
  const owner = fixture.connection.pool;
  const linkA = randomUUID();
  const linkB = randomUUID();
  let savedWatermarks: unknown[] = [];

  // 2019-03-05 12:00 UTC is 18:00 in Dhaka on 5 March; the clock is set to the Dhaka morning of
  // the 7th, so 5 and 6 March are the finished days.
  const clock = { now: () => new Date('2019-03-07T03:00:00Z') } as Clock;
  const stores = {
    maintenanceStoreIds: async (after: string | null) =>
      after === null ? [fixture.a, fixture.b] : [],
  } as StoresService;
  const service = new MaintenanceRollupsService(repository, stores, clock);

  const insertVisit = (storeId: string, linkId: string, at: string, visitor: string) =>
    owner.query(
      `insert into tracked_link_visits (id, store_id, tracked_link_id, event_key, occurred_at, visitor_hash)
       values ($6, $1, $2, $3, $4, $5)`,
      [storeId, linkId, randomUUID(), at, Buffer.from(visitor), randomUUID()],
    );
  const insertRun = (storeId: string, at: string, purpose: string, cost: number) =>
    owner.query(
      `insert into ai_runs (id, store_id, purpose, tier, model, prompt_version, input_tokens, output_tokens,
         cost_micro_usd, outcome, created_at)
       values ($5, $1, $2, 'reply', 'model', 'v1', 10, 5, $3, 'completed', $4)`,
      [storeId, purpose, cost, at, randomUUID()],
    );

  beforeAll(async () => {
    await fixture.setup();
    savedWatermarks = (await owner.query('select * from maintenance_watermarks')).rows;
    await owner.query('delete from maintenance_watermarks');
    await owner.query(
      `create table tracked_link_visits_y2019m03 partition of tracked_link_visits
       for values from ('2019-03-01 00:00:00+00') to ('2019-04-01 00:00:00+00')`,
    );
    await owner.query(
      `create table ai_runs_y2019m03 partition of ai_runs
       for values from ('2019-03-01 00:00:00+00') to ('2019-04-01 00:00:00+00')`,
    );
    for (const [id, storeId] of [
      [linkA, fixture.a],
      [linkB, fixture.b],
    ]) {
      await owner.query(
        "insert into tracked_links (id, store_id, code, source_type, target_url) values ($1, $2, $3, 'campaign', 'https://example.test')",
        [id, storeId, randomUUID().slice(0, 8)],
      );
    }
  });

  afterAll(async () => {
    await app.pool.end();
    await owner.query('delete from tracked_link_visit_days where store_id = any($1::uuid[])', [
      [fixture.a, fixture.b],
    ]);
    await owner.query('delete from store_daily_metrics where store_id = any($1::uuid[])', [
      [fixture.a, fixture.b],
    ]);
    await owner.query('drop table if exists tracked_link_visits_y2019m03, ai_runs_y2019m03');
    await owner.query('delete from tracked_links where store_id = any($1::uuid[])', [
      [fixture.a, fixture.b],
    ]);
    await owner.query('delete from maintenance_watermarks');
    for (const row of savedWatermarks as { rollup: string; completed_through: Date }[])
      await owner.query(
        'insert into maintenance_watermarks (rollup, completed_through) values ($1, $2)',
        [row.rollup, row.completed_through],
      );
    await fixture.close();
  });

  it('rolls each finished Dhaka day up for every store and keeps stores apart', async () => {
    // 18:30 UTC on the 4th is already the 5th in Dhaka.
    await insertVisit(fixture.a, linkA, '2019-03-04T18:30:00Z', 'x');
    await insertVisit(fixture.a, linkA, '2019-03-05T10:00:00Z', 'x');
    await insertVisit(fixture.a, linkA, '2019-03-05T11:00:00Z', 'y');
    await insertVisit(fixture.b, linkB, '2019-03-05T11:00:00Z', 'z');
    // 18:00 UTC on the 5th is the 6th in Dhaka.
    await insertVisit(fixture.a, linkA, '2019-03-05T18:00:00Z', 'x');
    await insertRun(fixture.a, '2019-03-05T10:00:00Z', 'chat_reply', 100);
    await insertRun(fixture.a, '2019-03-05T11:00:00Z', 'chat_reply', 50);
    await insertRun(fixture.b, '2019-03-05T11:00:00Z', 'chat_reply', 7);

    await service.rollUpFinishedDays();

    const visits = await owner.query(
      `select store_id, day::text, visits, unique_visitors from tracked_link_visit_days
       where store_id = any($1::uuid[]) order by store_id, day`,
      [[fixture.a, fixture.b]],
    );
    const byStore = (storeId: string) => visits.rows.filter((row) => row.store_id === storeId);
    expect(byStore(fixture.a)).toEqual([
      { store_id: fixture.a, day: '2019-03-05', visits: 3, unique_visitors: 2 },
      { store_id: fixture.a, day: '2019-03-06', visits: 1, unique_visitors: 1 },
    ]);
    expect(byStore(fixture.b)).toEqual([
      { store_id: fixture.b, day: '2019-03-05', visits: 1, unique_visitors: 1 },
    ]);
    const metrics = await owner.query(
      `select metric, dimension, value::int from store_daily_metrics
       where store_id = $1 and day = '2019-03-05' order by metric`,
      [fixture.a],
    );
    expect(metrics.rows).toEqual([
      { metric: 'ai_cost_micro_usd', dimension: 'chat_reply', value: 150 },
      { metric: 'ai_input_tokens', dimension: 'chat_reply', value: 20 },
      { metric: 'ai_output_tokens', dimension: 'chat_reply', value: 10 },
      { metric: 'ai_runs', dimension: 'chat_reply', value: 2 },
    ]);
    for (const rollup of ROLLUPS)
      expect(await repository.watermark(rollup as never)).toBe('2019-03-06');
  });

  it('repeats safely and does not roll up the day still in progress', async () => {
    await service.rollUpFinishedDays();
    const count = await owner.query(
      'select count(*)::int as total from tracked_link_visit_days where store_id = $1',
      [fixture.a],
    );
    expect(count.rows[0].total).toBe(2);
    expect(await repository.watermark('tracked_link_visit_days')).toBe('2019-03-06');
  });

  it('does not let a stale run move the watermark back', async () => {
    expect(
      await repository.advanceWatermark('tracked_link_visit_days', '2019-03-05', '2019-03-06'),
    ).toBe(false);
    expect(await repository.watermark('tracked_link_visit_days')).toBe('2019-03-06');
  });

  it('drops an expired month only once its rollup has passed the month', async () => {
    await owner.query("update maintenance_watermarks set completed_through = '2019-03-31'");
    expect(await service.dropExpiredPartitions()).toBe(0);
    await owner.query("update maintenance_watermarks set completed_through = '2019-04-01'");
    expect(await service.dropExpiredPartitions()).toBe(2);
  });

  it('keeps future months ready and reports when they run out', async () => {
    await service.ensurePartitions();
    expect(await repository.futureMonthCount()).toBeGreaterThanOrEqual(3);
  });
});
