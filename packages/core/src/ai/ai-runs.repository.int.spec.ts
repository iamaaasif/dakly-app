import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase } from '@dakly/db/client';
import { aiRuns } from '@dakly/db/schema/ai';

import { OwnerIsolationFixture } from '../../test/owner-isolation-fixture';
import { TenantDatabase } from '../platform/database/tenant-database';
import { AiRunsRepository, type AiRun } from './ai-runs.repository';

describe('AiRunsRepository', () => {
  const fixture = new OwnerIsolationFixture();
  const app = createDatabase(process.env.DATABASE_URL!);
  const tenant = new TenantDatabase(app.db);
  const repository = new AiRunsRepository(tenant);

  beforeAll(async () => fixture.setup());
  afterAll(async () => {
    await app.pool.end();
    await fixture.connection.pool.query('delete from ai_runs where store_id=any($1::uuid[])', [
      [fixture.a, fixture.b],
    ]);
    await fixture.close();
  });

  it('records the selected store and keeps the run hidden from other stores', async () => {
    const run = {
      storeId: fixture.b,
      purpose: 'chat_reply',
      tier: 'reply',
      model: 'gpt-6.1-terra',
      promptVersion: 'chat-reply.v1',
      outcome: 'completed',
      costMicroUsd: 1768,
    } satisfies AiRun & { storeId: string };

    const id = await repository.insert(fixture.a, run);
    expect(await fixture.row('ai_runs', id)).toMatchObject({
      store_id: fixture.a,
      prompt_version: run.promptVersion,
    });
    const findRuns = (storeId: string) =>
      tenant.forStore(storeId, (transaction) => transaction.select({ id: aiRuns.id }).from(aiRuns));
    expect(await findRuns(fixture.a)).toEqual([{ id }]);
    expect(await findRuns(fixture.b)).toEqual([]);

    const ownerRepository = new AiRunsRepository(new TenantDatabase(fixture.connection.db));
    expect(await ownerRepository.find(fixture.a, id)).toEqual({
      purpose: run.purpose,
      outcome: run.outcome,
    });
    expect(await ownerRepository.find(fixture.b, id)).toBeUndefined();
  });
});
