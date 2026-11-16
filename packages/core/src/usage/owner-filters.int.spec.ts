import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { UsageRepository } from './usage.repository';

describe('usage filters without RLS assistance', () => {
  const f = new OwnerIsolationFixture();
  const repository = new UsageRepository(f.tenant);
  const period = '2026-11-16';
  beforeAll(() => f.setup());
  afterAll(async () => {
    await f.connection.pool.query('delete from usage_events where store_id=any($1::uuid[])', [
      [f.a, f.b],
    ]);
    await f.close();
  });

  it('reads only the selected store usage for the same unit, reference and period', async () => {
    const first = await repository.insert(f.a, {
      unit: 'ai_ask',
      quantity: 2,
      source: 'allowance',
      reference: 'ai-run-1',
      periodStart: period,
    });
    await repository.insert(f.b, {
      unit: 'ai_ask',
      quantity: 5,
      source: 'allowance',
      reference: 'ai-run-1',
      periodStart: period,
    });
    expect(await repository.findByReference(f.a, 'ai_ask', 'ai-run-1')).toEqual(first);
    expect(await repository.periodTotal(f.a, 'ai_ask', period)).toBe(2);
    expect(await repository.periodTotal(f.b, 'ai_ask', period)).toBe(5);
  });
});
