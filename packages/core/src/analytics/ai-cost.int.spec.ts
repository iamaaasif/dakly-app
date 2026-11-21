import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { AnalyticsRepository } from './analytics.repository';

describe('AI cost in a period', () => {
  const f = new OwnerIsolationFixture();
  const analytics = new AnalyticsRepository(f.tenant);
  const range = { from: '2026-11-10', through: '2026-11-11', timeZone: 'Asia/Dhaka' };
  const query = (sql: string, values: unknown[]) => f.connection.pool.query(sql, values);

  beforeAll(async () => {
    await f.setup();
    // Dhaka is six hours ahead: 18:00Z on the 9th is already the 10th, 18:00Z on the 11th is the 12th.
    for (const [store, purpose, cost, at] of [
      [f.a, 'chat_reply', 1200, '2026-11-09T18:00:00Z'],
      [f.a, 'chat_reply', 300, '2026-11-11T17:59:00Z'],
      [f.a, 'classify', 50, '2026-11-10T05:00:00Z'],
      [f.a, 'content', 9000, '2026-11-10T05:00:00Z'],
      [f.a, 'chat_reply', 7000, '2026-11-11T18:00:00Z'],
      [f.b, 'chat_reply', 4000, '2026-11-10T05:00:00Z'],
    ] as const)
      await query(
        `insert into ai_runs(id,store_id,purpose,tier,model,prompt_version,cost_micro_usd,outcome,created_at)
         values(gen_random_uuid(),$1,$2,'reply','m','v1',$3,'completed',$4)`,
        [store, purpose, cost, at],
      );
  });

  afterAll(async () => {
    await query('delete from ai_runs where store_id=any($1::uuid[])', [[f.a, f.b]]);
    await f.close();
  });

  it('adds up only the chat purposes, by the shop day, for one shop', async () => {
    expect(await analytics.aiCostMicroUsd(f.a, range, ['chat_reply', 'classify'])).toBe(1550n);
    expect(await analytics.aiCostMicroUsd(f.b, range, ['chat_reply'])).toBe(4000n);
  });
});
